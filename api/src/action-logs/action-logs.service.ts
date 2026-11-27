import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DetailType, Prisma, StockMovementType } from '../generated/prisma/client.js';
import type { AuthUser } from '../auth/auth-user.js';
import { fromDbDate, todayInPeru, toDbDate } from '../common/peru-date.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type AppliedProductRow, ProductsService } from '../products/products.service.js';
import {
  actionLogDetailSelect,
  type ActionLogDetailResponse,
  actionLogSelect,
  type ActionLogResponse,
  canChange,
  toActionLogResponse,
} from './action-log.response.js';
import { diffSnapshots, type LogSnapshot, type ProductSnapshot } from './log-changes.js';
import {
  type CreateActionLog,
  detailSchemas,
  type ProductInput,
  type UpdateActionLog,
} from './action-logs.schemas.js';

const NO_PRODUCTS = 'Esta acción no lleva productos';

@Injectable()
export class ActionLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
  ) {}

  async create(cycleId: string, body: CreateActionLog, user: AuthUser): Promise<ActionLogResponse> {
    const cycle = await this.prisma.cycle.findUnique({
      where: { id: cycleId },
      include: { lot: { select: { active: true, greenhouseId: true } } },
    });
    if (!cycle) {
      throw new NotFoundException('El ciclo no existe');
    }
    if (!cycle.lot.active) {
      throw new ConflictException('El lote está desactivado; pide al administrador que lo reactive');
    }
    if (cycle.status !== 'ACTIVE') {
      throw new ConflictException('El ciclo está cerrado; registra en el ciclo activo del lote');
    }

    const date = body.date ?? todayInPeru();
    this.assertDateInCycle(date, fromDbDate(cycle.startDate));

    let name: string;
    let phaseId: string | null;
    let actionId: string | null = null;
    let details: Prisma.JsonObject | null = null;
    let products: AppliedProductRow[] = [];

    if (body.actionId) {
      const action = await this.prisma.action.findUnique({ where: { id: body.actionId } });
      if (!action?.active) {
        throw new BadRequestException('La acción no existe o ya no está disponible');
      }
      actionId = action.id;
      name = action.name;
      phaseId = action.phaseId;
      details = this.parseDetails(action.detailType, body.details);
      products = await this.products.applicationRows(
        this.checkProducts(action.detailType, body.products),
        date,
        cycle.lot.greenhouseId,
      );
    } else {
      // "Otra acción": free name, optional phase, no extra fields.
      if (body.products?.length) {
        throw new BadRequestException(NO_PRODUCTS);
      }
      name = body.name!;
      phaseId = body.phaseId ? await this.assertPhase(body.phaseId) : null;
    }

    const row = await this.prisma.actionLog.create({
      data: {
        cycleId,
        actionId,
        name,
        phaseId,
        date: toDbDate(date),
        details: details ?? Prisma.DbNull,
        notes: body.notes ?? null,
        userId: user.id,
        products: {
          create: products.map((row, order) =>
            productCreate(row, order, date, user.id, cycle.lot.greenhouseId),
          ),
        },
      },
      select: actionLogSelect,
    });
    return toActionLogResponse(row, user);
  }

  /** Edits are audited: one ActionLogChange per edit, in the same transaction. */
  async update(id: string, body: UpdateActionLog, user: AuthUser): Promise<ActionLogResponse> {
    const log = await this.prisma.actionLog.findUnique({
      where: { id },
      include: {
        action: true,
        cycle: { include: { lot: { select: { greenhouseId: true } } } },
        products: {
          orderBy: { order: 'asc' },
          select: { productId: true, product: true, dose: true, doseUnit: true, method: true },
        },
      },
    });
    if (!log) {
      throw new NotFoundException('El registro no existe');
    }
    if (!canChange(log.userId, user)) {
      throw new ForbiddenException('Solo puedes editar tus propios registros');
    }
    if (log.voidedAt) {
      throw new ConflictException('El registro está anulado; ya no se puede editar');
    }

    const before: LogSnapshot = {
      name: log.name,
      phaseId: log.phaseId,
      date: fromDbDate(log.date),
      details: log.details,
      products: log.products.map(toSnapshot),
      notes: log.notes,
    };
    const after = { ...before };
    // Applications take stock from their lot's greenhouse, which never changes.
    const { greenhouseId } = log.cycle.lot;
    if (body.date !== undefined) {
      this.assertDateInCycle(body.date, fromDbDate(log.cycle.startDate), log.cycle.endDate);
      after.date = body.date;
    }
    // Rows to write when products or the date change (the date moves their stock movements).
    let rows: (AppliedProductRow | ProductSnapshot)[] | null = null;

    if (log.action) {
      if (body.name !== undefined || body.phaseId !== undefined) {
        throw new BadRequestException(
          'El nombre y la fase solo se cambian en "Otra acción"',
        );
      }
      if (body.details !== undefined) {
        after.details = this.parseDetails(log.action.detailType, body.details);
      }
      if (body.products !== undefined) {
        rows = await this.products.applicationRows(
          this.checkProducts(log.action.detailType, body.products),
          after.date,
          greenhouseId,
          new Set(log.products.flatMap((p) => (p.productId ? [p.productId] : []))),
        );
        after.products = rows.map(toSnapshot);
      }
    } else {
      if (body.products?.length) {
        throw new BadRequestException(NO_PRODUCTS);
      }
      if (body.name !== undefined) after.name = body.name;
      if (body.phaseId !== undefined) {
        after.phaseId = body.phaseId === null ? null : await this.assertPhase(body.phaseId);
      }
    }
    if (body.notes !== undefined) after.notes = body.notes ?? null;
    if (!rows && after.date !== before.date && log.products.length) {
      rows = await this.reapply(log.products, after.date, greenhouseId);
    }

    if (JSON.stringify(before) === JSON.stringify(after)) {
      const row = await this.prisma.actionLog.findUniqueOrThrow({
        where: { id },
        select: actionLogSelect,
      });
      return toActionLogResponse(row, user);
    }

    // The change row goes first so the returned log already counts as edited.
    const [, row] = await this.prisma.$transaction([
      this.prisma.actionLogChange.create({
        data: {
          actionLogId: id,
          userId: user.id,
          before: before as unknown as Prisma.InputJsonValue,
          after: after as unknown as Prisma.InputJsonValue,
        },
      }),
      this.prisma.actionLog.update({
        where: { id },
        data: {
          name: after.name,
          phaseId: after.phaseId,
          date: toDbDate(after.date),
          details: (after.details as Prisma.InputJsonValue | null) ?? Prisma.DbNull,
          notes: after.notes,
          products: rows
            ? {
                deleteMany: {},
                create: rows.map((row, order) =>
                  productCreate(row, order, after.date, user.id, greenhouseId),
                ),
              }
            : undefined,
        },
        select: actionLogSelect,
      }),
    ]);
    return toActionLogResponse(row, user);
  }

  /**
   * Voids a log (PLAN §9): it stays, crossed out, with who voided it and why.
   * Its stock movements are removed in the same transaction, so the products
   * go back to stock; the applied products stay for the history.
   */
  async void(id: string, reason: string, user: AuthUser): Promise<ActionLogResponse> {
    const log = await this.prisma.actionLog.findUnique({
      where: { id },
      select: { userId: true, voidedAt: true },
    });
    if (!log) {
      throw new NotFoundException('El registro no existe');
    }
    if (!canChange(log.userId, user)) {
      throw new ForbiddenException('Solo puedes anular tus propios registros');
    }
    if (log.voidedAt) {
      throw new ConflictException('El registro ya está anulado');
    }

    try {
      const [, row] = await this.prisma.$transaction([
        this.prisma.stockMovement.deleteMany({ where: { actionLogProduct: { actionLogId: id } } }),
        this.prisma.actionLog.update({
          // `voidedAt: null` keeps a second, simultaneous void from overwriting the first.
          where: { id, voidedAt: null },
          data: { voidedAt: new Date(), voidedById: user.id, voidReason: reason },
          select: actionLogSelect,
        }),
      ]);
      return toActionLogResponse(row, user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new ConflictException('El registro ya está anulado');
      }
      throw error;
    }
  }

  async findOne(id: string, user: AuthUser): Promise<ActionLogDetailResponse> {
    const row = await this.prisma.actionLog.findUnique({
      where: { id },
      select: actionLogDetailSelect,
    });
    if (!row) {
      throw new NotFoundException('El registro no existe');
    }

    // Only 9 phases: one small query turns stored phase ids into labels.
    const phases = row.changes.length
      ? await this.prisma.phase.findMany({ select: { id: true, order: true, name: true } })
      : [];
    const labels = new Map(phases.map((phase) => [phase.id, `${phase.order}. ${phase.name}`]));
    const phaseLabel = (phaseId: string) => labels.get(phaseId) ?? 'Fase eliminada';

    const { cycle } = row;
    return {
      ...toActionLogResponse(row, user),
      lot: cycle.lot,
      cycle: {
        id: cycle.id,
        number: cycle.number,
        status: cycle.status,
        startDate: fromDbDate(cycle.startDate),
        endDate: cycle.endDate ? fromDbDate(cycle.endDate) : null,
      },
      changes: row.changes.map((change) => ({
        id: change.id,
        changedAt: change.changedAt,
        user: change.user,
        fields: diffSnapshots(
          change.before as Partial<LogSnapshot>,
          change.after as Partial<LogSnapshot>,
          phaseLabel,
        ),
      })),
    };
  }

  /** Validates extra fields; stores `null` when nothing was filled. */
  private parseDetails(
    type: DetailType,
    input: Record<string, unknown> | null | undefined,
  ): Prisma.JsonObject | null {
    if (!input) {
      return null;
    }
    const result = detailSchemas[type].safeParse(input);
    if (!result.success) {
      throw new BadRequestException(result.error.issues.map((issue) => issue.message));
    }
    const filled = Object.fromEntries(
      Object.entries(result.data).filter(([, value]) => value !== undefined),
    ) as Prisma.JsonObject;
    return Object.keys(filled).length ? filled : null;
  }

  /**
   * The log's products again for a new date: catalog products recompute their
   * movement; products from before the catalog are kept as they are.
   */
  private async reapply(
    existing: (ProductSnapshot & { productId: string | null })[],
    date: string,
    greenhouseId: string,
  ): Promise<(AppliedProductRow | ProductSnapshot)[]> {
    const catalog = existing.filter((p) => p.productId);
    const resolved = await this.products.applicationRows(
      catalog.map((p) => ({ ...p, productId: p.productId! })),
      date,
      greenhouseId,
      new Set(catalog.map((p) => p.productId!)),
    );
    return existing.map((p) => (p.productId ? resolved.shift()! : toSnapshot(p)));
  }

  /** Products are only for APPLICATION actions. */
  private checkProducts(type: DetailType, products: ProductInput[] | undefined): ProductInput[] {
    if (!products?.length) {
      return [];
    }
    if (type !== DetailType.APPLICATION) {
      throw new BadRequestException(NO_PRODUCTS);
    }
    return products;
  }

  private async assertPhase(phaseId: string): Promise<string> {
    const phase = await this.prisma.phase.findUnique({ where: { id: phaseId } });
    if (!phase) {
      throw new BadRequestException('La fase no existe');
    }
    return phase.id;
  }

  private assertDateInCycle(date: string, start: string, end?: Date | null): void {
    if (date > todayInPeru()) {
      throw new BadRequestException('La fecha no puede ser posterior a hoy');
    }
    if (date < start) {
      throw new BadRequestException('La fecha es anterior al inicio del ciclo');
    }
    if (end && date > fromDbDate(end)) {
      throw new BadRequestException('La fecha es posterior al cierre del ciclo');
    }
  }
}

const toSnapshot = ({ product, dose, doseUnit, method }: ProductSnapshot): ProductSnapshot => ({
  product,
  dose,
  doseUnit,
  method,
});

/** ActionLogProduct create data, with its stock movement (from the lot's greenhouse) when it takes stock. */
function productCreate(
  row: AppliedProductRow | ProductSnapshot,
  order: number,
  date: string,
  userId: string,
  greenhouseId: string,
): Prisma.ActionLogProductCreateWithoutActionLogInput {
  const snapshot = { ...toSnapshot(row), order };
  if (!('productId' in row)) return snapshot;
  return {
    ...snapshot,
    catalog: { connect: { id: row.productId } },
    movement: row.movement
      ? {
          create: {
            type: StockMovementType.APPLICATION,
            date: toDbDate(date),
            quantity: row.movement.quantity,
            product: { connect: { id: row.productId } },
            greenhouse: { connect: { id: greenhouseId } },
            user: { connect: { id: userId } },
          },
        }
      : undefined,
  };
}

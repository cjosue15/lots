import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DetailType, Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../auth/auth-user.js';
import { fromDbDate, todayInPeru, toDbDate } from '../common/peru-date.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  actionLogDetailSelect,
  type ActionLogDetailResponse,
  actionLogSelect,
  type ActionLogResponse,
  toActionLogResponse,
} from './action-log.response.js';
import { diffSnapshots, type LogSnapshot } from './log-changes.js';
import {
  type CreateActionLog,
  detailSchemas,
  type ProductInput,
  type UpdateActionLog,
} from './action-logs.schemas.js';

const NO_PRODUCTS = 'Esta acción no lleva productos';

@Injectable()
export class ActionLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(cycleId: string, body: CreateActionLog, user: AuthUser): Promise<ActionLogResponse> {
    const cycle = await this.prisma.cycle.findUnique({
      where: { id: cycleId },
      include: { lot: { select: { active: true } } },
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
    let products: ProductInput[] = [];

    if (body.actionId) {
      const action = await this.prisma.action.findUnique({ where: { id: body.actionId } });
      if (!action?.active) {
        throw new BadRequestException('La acción no existe o ya no está disponible');
      }
      actionId = action.id;
      name = action.name;
      phaseId = action.phaseId;
      details = this.parseDetails(action.detailType, body.details);
      products = this.checkProducts(action.detailType, body.products);
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
        products: { create: products.map((product, order) => ({ ...product, order })) },
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
        cycle: true,
        products: {
          orderBy: { order: 'asc' },
          select: { product: true, dose: true, doseUnit: true, method: true },
        },
      },
    });
    if (!log) {
      throw new NotFoundException('El registro no existe');
    }
    if (user.role !== 'admin' && log.userId !== user.id) {
      throw new ForbiddenException('Solo puedes editar tus propios registros');
    }

    const before: LogSnapshot = {
      name: log.name,
      phaseId: log.phaseId,
      date: fromDbDate(log.date),
      details: log.details,
      products: log.products,
      notes: log.notes,
    };
    const after = { ...before };

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
        after.products = this.checkProducts(log.action.detailType, body.products);
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
    if (body.date !== undefined) {
      this.assertDateInCycle(body.date, fromDbDate(log.cycle.startDate), log.cycle.endDate);
      after.date = body.date;
    }
    if (body.notes !== undefined) after.notes = body.notes ?? null;

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
          products:
            after.products === before.products
              ? undefined
              : {
                  deleteMany: {},
                  create: (after.products ?? []).map((product, order) => ({ ...product, order })),
                },
        },
        select: actionLogSelect,
      }),
    ]);
    return toActionLogResponse(row, user);
  }

  async findOne(id: string, user: AuthUser): Promise<ActionLogDetailResponse> {
    const row = await this.prisma.actionLog.findUnique({
      where: { id },
      select: actionLogDetailSelect,
    });
    if (!row) {
      throw new NotFoundException('El registro no existe');
    }

    // Only 8 phases: one small query turns stored phase ids into labels.
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

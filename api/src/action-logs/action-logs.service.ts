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
  actionLogSelect,
  type ActionLogResponse,
  toActionLogResponse,
} from './action-log.response.js';
import {
  type CreateActionLog,
  detailSchemas,
  type UpdateActionLog,
} from './action-logs.schemas.js';

@Injectable()
export class ActionLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(cycleId: string, body: CreateActionLog, user: AuthUser): Promise<ActionLogResponse> {
    const cycle = await this.prisma.cycle.findUnique({ where: { id: cycleId } });
    if (!cycle) {
      throw new NotFoundException('El ciclo no existe');
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

    if (body.actionId) {
      const action = await this.prisma.action.findUnique({ where: { id: body.actionId } });
      if (!action?.active) {
        throw new BadRequestException('La acción no existe o ya no está disponible');
      }
      actionId = action.id;
      name = action.name;
      phaseId = action.phaseId;
      details = this.parseDetails(action.detailType, body.details);
    } else {
      // "Otra acción": free name, optional phase, no extra fields.
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
      },
      select: actionLogSelect,
    });
    return toActionLogResponse(row, user);
  }

  /** Edits are audited: one ActionLogChange per edit, in the same transaction. */
  async update(id: string, body: UpdateActionLog, user: AuthUser): Promise<ActionLogResponse> {
    const log = await this.prisma.actionLog.findUnique({
      where: { id },
      include: { action: true, cycle: true },
    });
    if (!log) {
      throw new NotFoundException('El registro no existe');
    }
    if (user.role !== 'admin' && log.userId !== user.id) {
      throw new ForbiddenException('Solo puedes editar tus propios registros');
    }

    const before = {
      name: log.name,
      phaseId: log.phaseId,
      date: fromDbDate(log.date),
      details: log.details,
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
    } else {
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
      return this.findOne(id, user);
    }

    // The change row goes first so the returned log already counts as edited.
    const [, row] = await this.prisma.$transaction([
      this.prisma.actionLogChange.create({
        data: {
          actionLogId: id,
          userId: user.id,
          before: before as Prisma.InputJsonValue,
          after: after as Prisma.InputJsonValue,
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
        },
        select: actionLogSelect,
      }),
    ]);
    return toActionLogResponse(row, user);
  }

  async findOne(id: string, user: AuthUser): Promise<ActionLogResponse> {
    const row = await this.prisma.actionLog.findUnique({ where: { id }, select: actionLogSelect });
    if (!row) {
      throw new NotFoundException('El registro no existe');
    }
    return toActionLogResponse(row, user);
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

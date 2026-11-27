import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  actionLogSelect,
  type ActionLogResponse,
  toActionLogResponse,
} from '../action-logs/action-log.response.js';
import type { AuthUser } from '../auth/auth-user.js';
import {
  daysBetween,
  fromDbDate,
  todayInPeru,
  toDbDate,
} from '../common/peru-date.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { currentPhase, type PhaseRef } from './current-phase.js';

export interface CycleSummary {
  id: string;
  number: number;
  startDate: string;
  /** Days since the cycle started (today − startDate). */
  days: number;
  /** `null` = "Sin registros" (no log with a phase yet). */
  phase: PhaseRef | null;
  /** `code` is the action's 3D key (null for actions without one). */
  lastLog: { name: string; date: string; code: string | null } | null;
  /**
   * Names of today's logs without a phase (general actions and "Otra acción"
   * without one), newest first, so they can be shown next to the phase on
   * that day only.
   */
  todayGeneral: string[];
  /**
   * Last log with a phase: what the overview shows as "Último", and what the
   * 3D worker goes back to once a general action is no longer today's.
   */
  lastPhaseLog: { name: string; date: string; code: string | null } | null;
}

export interface LotSummary {
  id: string;
  number: number;
  greenhouse: { id: string; name: string };
  /** `null` = the lot has no active cycle yet. */
  cycle: CycleSummary | null;
}

export interface CycleHistoryItem {
  id: string;
  number: number;
  startDate: string;
  endDate: string | null;
  status: 'ACTIVE' | 'CLOSED';
  /** Days between start and end (or today while active). */
  days: number;
}

/** A cycle with all its logs (used for closed cycles in the history). */
export interface CycleDetail extends CycleHistoryItem {
  lot: { id: string; number: number; greenhouse: { id: string; name: string } };
  /** Phase reached in the cycle (rule B). */
  phase: PhaseRef | null;
  logs: ActionLogResponse[];
}

export interface LotDetail extends LotSummary {
  logs: ActionLogResponse[];
  cycles: CycleHistoryItem[];
}

const activeCycleInclude = {
  where: { status: 'ACTIVE' },
  take: 1,
  include: {
    actionLogs: {
      // Voided logs no longer count for the phase, "Último" or today's actions (PLAN §9).
      where: { voidedAt: null },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      select: {
        name: true,
        date: true,
        phase: { select: { order: true, name: true } },
        action: { select: { code: true } },
      },
    },
  },
} satisfies Prisma.Lot$cyclesArgs;

type LotWithActiveCycle = Prisma.LotGetPayload<{
  include: { greenhouse: true; cycles: typeof activeCycleInclude };
}>;

@Injectable()
export class LotsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Overview: every active lot with its current phase, computed on read. */
  async findAll(): Promise<LotSummary[]> {
    const lots = await this.prisma.lot.findMany({
      where: { active: true },
      orderBy: [{ greenhouse: { name: 'asc' } }, { number: 'asc' }],
      include: { greenhouse: true, cycles: activeCycleInclude },
    });
    const today = todayInPeru();
    return lots.map((lot) => this.toSummary(lot, today));
  }

  async findOne(id: string, viewer: AuthUser): Promise<LotDetail> {
    const lot = await this.prisma.lot.findUnique({
      where: { id },
      include: { greenhouse: true, cycles: activeCycleInclude },
    });
    if (!lot) {
      throw new NotFoundException('El lote no existe');
    }

    const today = todayInPeru();
    const summary = this.toSummary(lot, today);
    const [logs, cycles] = await Promise.all([
      summary.cycle
        ? this.prisma.actionLog.findMany({
            where: { cycleId: summary.cycle.id },
            orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
            select: actionLogSelect,
          })
        : [],
      this.prisma.cycle.findMany({
        where: { lotId: id },
        orderBy: { number: 'desc' },
      }),
    ]);

    return {
      ...summary,
      logs: logs.map((row) => toActionLogResponse(row, viewer)),
      cycles: cycles.map((cycle) => this.toHistoryItem(cycle, today)),
    };
  }

  async findCycle(id: string, viewer: AuthUser): Promise<CycleDetail> {
    const cycle = await this.prisma.cycle.findUnique({
      where: { id },
      include: {
        lot: {
          select: {
            id: true,
            number: true,
            greenhouse: { select: { id: true, name: true } },
          },
        },
        actionLogs: {
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
          select: actionLogSelect,
        },
      },
    });
    if (!cycle) {
      throw new NotFoundException('El ciclo no existe');
    }
    return {
      ...this.toHistoryItem(cycle, todayInPeru()),
      lot: cycle.lot,
      phase: currentPhase(cycle.actionLogs.filter((log) => !log.voidedAt)),
      logs: cycle.actionLogs.map((row) => toActionLogResponse(row, viewer)),
    };
  }

  /**
   * "Nuevo ciclo": closes the active cycle (endDate = new start date) and opens
   * the next number, in one transaction. The partial unique index guarantees a
   * single active cycle even if two people press the button at once.
   */
  async startCycle(
    lotId: string,
    startDate: string | undefined,
    user: AuthUser,
  ) {
    const start = startDate ?? todayInPeru();
    if (start > todayInPeru()) {
      throw new BadRequestException(
        'La fecha de inicio no puede ser posterior a hoy',
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const lot = await tx.lot.findUnique({ where: { id: lotId } });
        if (!lot) {
          throw new NotFoundException('El lote no existe');
        }
        if (!lot.active) {
          throw new ConflictException(
            'El lote está desactivado; pide al administrador que lo reactive',
          );
        }

        const last = await tx.cycle.findFirst({
          where: { lotId },
          orderBy: { number: 'desc' },
        });
        if (last?.status === 'ACTIVE') {
          if (start < fromDbDate(last.startDate)) {
            throw new BadRequestException(
              'La fecha de inicio es anterior al inicio del ciclo actual',
            );
          }
          // The closing cycle ends on `start`: none of its logs can be later.
          const later = await tx.actionLog.findFirst({
            where: {
              cycleId: last.id,
              voidedAt: null,
              date: { gt: toDbDate(start) },
            },
            select: { id: true },
          });
          if (later) {
            throw new BadRequestException(
              `El ciclo ${last.number} tiene registros después de esa fecha`,
            );
          }
          await tx.cycle.update({
            where: { id: last.id },
            data: { status: 'CLOSED', endDate: toDbDate(start) },
          });
        }

        await tx.cycle.create({
          data: {
            lotId,
            number: (last?.number ?? 0) + 1,
            startDate: toDbDate(start),
            createdById: user.id,
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Otra persona acaba de iniciar un ciclo en este lote',
        );
      }
      throw error;
    }

    return this.findOne(lotId, user);
  }

  private toHistoryItem(
    cycle: {
      id: string;
      number: number;
      startDate: Date;
      endDate: Date | null;
      status: 'ACTIVE' | 'CLOSED';
    },
    today: string,
  ): CycleHistoryItem {
    const start = fromDbDate(cycle.startDate);
    const end = cycle.endDate ? fromDbDate(cycle.endDate) : null;
    return {
      id: cycle.id,
      number: cycle.number,
      startDate: start,
      endDate: end,
      status: cycle.status,
      days: daysBetween(start, end ?? today),
    };
  }

  private toSummary(lot: LotWithActiveCycle, today: string): LotSummary {
    const cycle = lot.cycles[0];
    const last = cycle?.actionLogs[0];
    const lastPhase = cycle?.actionLogs.find((log) => log.phase);
    return {
      id: lot.id,
      number: lot.number,
      greenhouse: { id: lot.greenhouse.id, name: lot.greenhouse.name },
      cycle: cycle
        ? {
            id: cycle.id,
            number: cycle.number,
            startDate: fromDbDate(cycle.startDate),
            days: daysBetween(fromDbDate(cycle.startDate), today),
            phase: currentPhase(cycle.actionLogs),
            lastLog: last
              ? {
                  name: last.name,
                  date: fromDbDate(last.date),
                  code: last.action?.code ?? null,
                }
              : null,
            lastPhaseLog: lastPhase
              ? {
                  name: lastPhase.name,
                  date: fromDbDate(lastPhase.date),
                  code: lastPhase.action?.code ?? null,
                }
              : null,
            todayGeneral: [
              ...new Set(
                cycle.actionLogs
                  .filter((log) => !log.phase && fromDbDate(log.date) === today)
                  .map((log) => log.name),
              ),
            ],
          }
        : null,
    };
  }
}

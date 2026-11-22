import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { type DetailType, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateAction,
  CreateLot,
  MoveAction,
  UpdateAction,
  UpdateLot,
} from './admin.schemas.js';

export interface AdminAction {
  id: string;
  name: string;
  phaseId: string | null;
  order: number;
  detailType: DetailType;
  active: boolean;
  /** Logs that used this action (they keep their own copy of name and phase). */
  logCount: number;
}

export interface AdminTemplate {
  phases: { id: string; order: number; name: string; actions: AdminAction[] }[];
  general: AdminAction[];
}

export interface AdminLot {
  id: string;
  number: number;
  active: boolean;
  cycleCount: number;
  /** Number of the active cycle, if any. */
  activeCycle: number | null;
}

export interface AdminGreenhouse {
  id: string;
  name: string;
  lots: AdminLot[];
}

const actionSelect = {
  id: true,
  name: true,
  phaseId: true,
  order: true,
  detailType: true,
  active: true,
  _count: { select: { actionLogs: true } },
} satisfies Prisma.ActionSelect;

type ActionRow = Prisma.ActionGetPayload<{ select: typeof actionSelect }>;

const toAdminAction = ({ _count, ...action }: ActionRow): AdminAction => ({
  ...action,
  logCount: _count.actionLogs,
});

/**
 * Template and lot administration (PLAN §10, "Administración"). Phases can only
 * be renamed; actions and lots are deactivated, never deleted.
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async template(): Promise<AdminTemplate> {
    const [phases, general] = await Promise.all([
      this.prisma.phase.findMany({
        orderBy: { order: 'asc' },
        select: {
          id: true,
          order: true,
          name: true,
          actions: { orderBy: { order: 'asc' }, select: actionSelect },
        },
      }),
      this.prisma.action.findMany({
        where: { phaseId: null },
        orderBy: { order: 'asc' },
        select: actionSelect,
      }),
    ]);
    return {
      phases: phases.map((phase) => ({ ...phase, actions: phase.actions.map(toAdminAction) })),
      general: general.map(toAdminAction),
    };
  }

  async renamePhase(id: string, name: string): Promise<AdminTemplate> {
    await this.assertPhase(id);
    await this.prisma.phase.update({ where: { id }, data: { name } });
    return this.template();
  }

  async createAction(body: CreateAction): Promise<AdminTemplate> {
    if (body.phaseId) await this.assertPhase(body.phaseId);
    await this.prisma.action.create({
      data: { ...body, order: await this.nextOrder(body.phaseId) },
    });
    return this.template();
  }

  async updateAction(id: string, body: UpdateAction): Promise<AdminTemplate> {
    const action = await this.prisma.action.findUnique({ where: { id } });
    if (!action) throw new NotFoundException('La acción no existe');

    const data: Prisma.ActionUncheckedUpdateInput = { ...body };
    // Moving to another group puts the action at the end of it.
    if (body.phaseId !== undefined && body.phaseId !== action.phaseId) {
      if (body.phaseId) await this.assertPhase(body.phaseId);
      data.order = await this.nextOrder(body.phaseId);
    }
    await this.prisma.action.update({ where: { id }, data });
    return this.template();
  }

  /** Swaps the action with its neighbour in the same group (phase or general). */
  async moveAction(id: string, { direction }: MoveAction): Promise<AdminTemplate> {
    const action = await this.prisma.action.findUnique({ where: { id } });
    if (!action) throw new NotFoundException('La acción no existe');

    const neighbour = await this.prisma.action.findFirst({
      where: {
        phaseId: action.phaseId,
        order: direction === 'up' ? { lt: action.order } : { gt: action.order },
      },
      orderBy: { order: direction === 'up' ? 'desc' : 'asc' },
    });
    if (neighbour) {
      await this.prisma.$transaction([
        this.prisma.action.update({ where: { id: action.id }, data: { order: neighbour.order } }),
        this.prisma.action.update({ where: { id: neighbour.id }, data: { order: action.order } }),
      ]);
    }
    return this.template();
  }

  async lots(): Promise<AdminGreenhouse[]> {
    const greenhouses = await this.prisma.greenhouse.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        lots: {
          orderBy: { number: 'asc' },
          select: {
            id: true,
            number: true,
            active: true,
            _count: { select: { cycles: true } },
            cycles: { where: { status: 'ACTIVE' }, select: { number: true } },
          },
        },
      },
    });
    return greenhouses.map((greenhouse) => ({
      ...greenhouse,
      lots: greenhouse.lots.map((lot) => ({
        id: lot.id,
        number: lot.number,
        active: lot.active,
        cycleCount: lot._count.cycles,
        activeCycle: lot.cycles[0]?.number ?? null,
      })),
    }));
  }

  async createLot({ greenhouseId, number }: CreateLot): Promise<AdminGreenhouse[]> {
    const greenhouse = await this.prisma.greenhouse.findUnique({ where: { id: greenhouseId } });
    if (!greenhouse) throw new NotFoundException('El invernadero no existe');
    try {
      await this.prisma.lot.create({ data: { greenhouseId, number } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`${greenhouse.name} ya tiene un lote ${number}`);
      }
      throw error;
    }
    return this.lots();
  }

  async updateLot(id: string, { active }: UpdateLot): Promise<AdminGreenhouse[]> {
    const lot = await this.prisma.lot.findUnique({ where: { id } });
    if (!lot) throw new NotFoundException('El lote no existe');
    await this.prisma.lot.update({ where: { id }, data: { active } });
    return this.lots();
  }

  private async assertPhase(id: string): Promise<void> {
    const phase = await this.prisma.phase.findUnique({ where: { id } });
    if (!phase) throw new NotFoundException('La fase no existe');
  }

  private async nextOrder(phaseId: string | null): Promise<number> {
    const { _max } = await this.prisma.action.aggregate({
      where: { phaseId },
      _max: { order: true },
    });
    return (_max.order ?? 0) + 1;
  }
}

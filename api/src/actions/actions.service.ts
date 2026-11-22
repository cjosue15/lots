import { Injectable } from '@nestjs/common';
import type { DetailType } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface TemplateAction {
  id: string;
  name: string;
  detailType: DetailType;
}

export interface ActionTemplate {
  phases: { id: string; order: number; name: string; actions: TemplateAction[] }[];
  general: TemplateAction[];
}

@Injectable()
export class ActionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active actions grouped by phase, plus general actions (no phase). */
  async template(): Promise<ActionTemplate> {
    const select = { id: true, name: true, detailType: true } as const;
    const [phases, general] = await Promise.all([
      this.prisma.phase.findMany({
        orderBy: { order: 'asc' },
        select: {
          id: true,
          order: true,
          name: true,
          actions: { where: { active: true }, orderBy: { order: 'asc' }, select },
        },
      }),
      this.prisma.action.findMany({
        where: { phaseId: null, active: true },
        orderBy: { order: 'asc' },
        select,
      }),
    ]);
    return { phases, general };
  }
}

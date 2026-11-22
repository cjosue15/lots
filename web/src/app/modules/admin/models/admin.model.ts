import type { DetailType } from '../../lots/models/lot.model';

export interface AdminAction {
  id: string;
  name: string;
  phaseId: string | null;
  order: number;
  detailType: DetailType;
  active: boolean;
  logCount: number;
}

export interface AdminPhase {
  id: string;
  order: number;
  name: string;
  actions: AdminAction[];
}

export interface AdminTemplate {
  phases: AdminPhase[];
  general: AdminAction[];
}

export interface AdminLot {
  id: string;
  number: number;
  active: boolean;
  cycleCount: number;
  activeCycle: number | null;
}

export interface AdminGreenhouse {
  id: string;
  name: string;
  lots: AdminLot[];
}

export interface ActionInput {
  name: string;
  phaseId: string | null;
  detailType: DetailType;
}

/** Spanish names of the extra fields each detail type asks for (PLAN §8). */
export const DETAIL_TYPE_LABELS: Record<DetailType, string> = {
  NONE: 'Sin campos extra',
  APPLICATION: 'Aplicación: producto y dosis',
  IRRIGATION: 'Riego: humedad',
  PEST_CHECK: 'Revisión de plagas: resultado y químico',
  FERTILIZER_EVAL: 'Evaluación de fertilizante: resultado',
};

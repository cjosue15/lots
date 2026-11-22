import type { DetailType } from './lot.model';

export interface TemplateAction {
  id: string;
  name: string;
  detailType: DetailType;
}

export interface ActionTemplate {
  phases: { id: string; order: number; name: string; actions: TemplateAction[] }[];
  general: TemplateAction[];
}

export interface CreateActionLog {
  actionId?: string;
  name?: string;
  phaseId?: string;
  date?: string;
  details?: Record<string, unknown>;
  notes?: string;
}

export const FERTILIZER_RESULTS = {
  WORKED: 'Funcionó bien',
  CHANGE: 'Hay que cambiarlo',
} as const;

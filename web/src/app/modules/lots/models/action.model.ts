import type { ApplicationMethod, DetailType, DoseUnit } from './lot.model';

/** A product as the form sends it; empty fields are left out. */
export interface ProductInput {
  product: string;
  dose?: number;
  doseUnit?: DoseUnit;
  method?: ApplicationMethod;
}

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
  /** APPLICATION actions only. */
  products?: ProductInput[];
  notes?: string;
}

export const FERTILIZER_RESULTS = {
  WORKED: 'Funcionó bien',
  CHANGE: 'Hay que cambiarlo',
} as const;

/** PATCH body. `null` clears a field. */
export interface UpdateActionLog {
  name?: string;
  phaseId?: string | null;
  date?: string;
  details?: Record<string, unknown> | null;
  /** `[]` removes every product. */
  products?: ProductInput[];
  notes?: string | null;
}

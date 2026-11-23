export type DetailType = 'NONE' | 'APPLICATION' | 'IRRIGATION' | 'PEST_CHECK' | 'FERTILIZER_EVAL';

export interface PhaseRef {
  order: number;
  name: string;
}

export interface CycleSummary {
  id: string;
  number: number;
  startDate: string;
  days: number;
  /** null = no log with a phase yet ("Sin registros"). */
  phase: PhaseRef | null;
  /** `code`: the action's key for the 3D view (null when it has none). */
  lastLog: { name: string; date: string; code: string | null } | null;
  /** Today's logs without a phase (general actions), shown on that day only. */
  todayGeneral: string[];
  /** Last log with a phase: "Último" in the overview; the 3D worker falls back to it. */
  lastPhaseLog: { name: string; date: string; code: string | null } | null;
}

export interface LotSummary {
  id: string;
  number: number;
  greenhouse: { id: string; name: string };
  /** null = the lot has no active cycle yet. */
  cycle: CycleSummary | null;
}

export interface ActionLog {
  id: string;
  cycleId: string;
  actionId: string | null;
  name: string;
  phase: { id: string; order: number; name: string } | null;
  detailType: DetailType | null;
  date: string;
  details: Record<string, unknown> | null;
  notes: string | null;
  user: { id: string; displayName: string };
  edited: boolean;
  canEdit: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CycleHistoryItem {
  id: string;
  number: number;
  startDate: string;
  endDate: string | null;
  status: 'ACTIVE' | 'CLOSED';
  days: number;
}

export interface LotDetail extends LotSummary {
  logs: ActionLog[];
  cycles: CycleHistoryItem[];
}

export interface LotRef {
  id: string;
  number: number;
  greenhouse: { id: string; name: string };
}

export type ChangedField = 'name' | 'phase' | 'date' | 'details' | 'notes';

export interface FieldChange {
  field: ChangedField;
  before: unknown;
  after: unknown;
}

export interface ActionLogChange {
  id: string;
  changedAt: string;
  user: { id: string; displayName: string };
  fields: FieldChange[];
}

export interface ActionLogDetail extends ActionLog {
  lot: LotRef;
  cycle: {
    id: string;
    number: number;
    status: 'ACTIVE' | 'CLOSED';
    startDate: string;
    endDate: string | null;
  };
  /** Newest first. */
  changes: ActionLogChange[];
}

export interface CycleDetail extends CycleHistoryItem {
  lot: LotRef;
  phase: PhaseRef | null;
  logs: ActionLog[];
}

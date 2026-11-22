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
  lastLog: { name: string; date: string } | null;
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

import type { ApplicationMethod, DoseUnit, Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../auth/auth-user.js';
import { fromDbDate } from '../common/peru-date.js';
import type { FieldChange } from './log-changes.js';

/** Prisma `select` shared by every query that returns logs. */
export const actionLogSelect = {
  id: true,
  cycleId: true,
  actionId: true,
  name: true,
  date: true,
  details: true,
  notes: true,
  products: {
    orderBy: { order: 'asc' },
    select: { productId: true, product: true, dose: true, doseUnit: true, method: true },
  },
  createdAt: true,
  updatedAt: true,
  phase: { select: { id: true, order: true, name: true } },
  action: { select: { detailType: true } },
  user: { select: { id: true, displayName: true } },
  voidedAt: true,
  voidReason: true,
  voidedBy: { select: { id: true, displayName: true } },
  _count: { select: { changes: true } },
} satisfies Prisma.ActionLogSelect;

type ActionLogRow = Prisma.ActionLogGetPayload<{ select: typeof actionLogSelect }>;

export interface ActionLogResponse {
  id: string;
  cycleId: string;
  actionId: string | null;
  name: string;
  phase: { id: string; order: number; name: string } | null;
  detailType: string | null;
  date: string;
  details: Prisma.JsonValue;
  /** APPLICATION logs only; empty otherwise. */
  products: {
    /** Null on logs from before the catalog. */
    productId: string | null;
    product: string;
    dose: number | null;
    doseUnit: DoseUnit | null;
    method: ApplicationMethod | null;
  }[];
  notes: string | null;
  user: { id: string; displayName: string };
  edited: boolean;
  /** Voided logs stay in the history, crossed out, and no longer count (PLAN §9). */
  voided: { at: Date; reason: string; user: { id: string; displayName: string } | null } | null;
  /** Authors edit and void their own logs; admins all. Never once voided. */
  canEdit: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function toActionLogResponse(row: ActionLogRow, viewer: AuthUser): ActionLogResponse {
  return {
    id: row.id,
    cycleId: row.cycleId,
    actionId: row.actionId,
    name: row.name,
    phase: row.phase,
    detailType: row.action?.detailType ?? null,
    date: fromDbDate(row.date),
    details: row.details,
    products: row.products,
    notes: row.notes,
    user: row.user,
    edited: row._count.changes > 0,
    voided: row.voidedAt
      ? { at: row.voidedAt, reason: row.voidReason ?? '', user: row.voidedBy }
      : null,
    canEdit: !row.voidedAt && canChange(row.user.id, viewer),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Authors edit and void their own logs; admins edit and void all. */
export function canChange(authorId: string, viewer: AuthUser): boolean {
  return viewer.role === 'admin' || authorId === viewer.id;
}

/** Extra data for the log detail screen: where it belongs and its edit history. */
export const actionLogDetailSelect = {
  ...actionLogSelect,
  cycle: {
    select: {
      id: true,
      number: true,
      status: true,
      startDate: true,
      endDate: true,
      lot: { select: { id: true, number: true, greenhouse: { select: { id: true, name: true } } } },
    },
  },
  changes: {
    orderBy: { changedAt: 'desc' },
    select: {
      id: true,
      changedAt: true,
      before: true,
      after: true,
      user: { select: { id: true, displayName: true } },
    },
  },
} satisfies Prisma.ActionLogSelect;

export interface ActionLogChangeResponse {
  id: string;
  changedAt: Date;
  user: { id: string; displayName: string };
  fields: FieldChange[];
}

export interface ActionLogDetailResponse extends ActionLogResponse {
  lot: { id: string; number: number; greenhouse: { id: string; name: string } };
  cycle: {
    id: string;
    number: number;
    status: 'ACTIVE' | 'CLOSED';
    startDate: string;
    endDate: string | null;
  };
  /** Newest first. */
  changes: ActionLogChangeResponse[];
}

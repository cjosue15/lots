import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../auth/auth-user.js';
import { fromDbDate } from '../common/peru-date.js';

/** Prisma `select` shared by every query that returns logs. */
export const actionLogSelect = {
  id: true,
  cycleId: true,
  actionId: true,
  name: true,
  date: true,
  details: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  phase: { select: { id: true, order: true, name: true } },
  action: { select: { detailType: true } },
  user: { select: { id: true, displayName: true } },
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
  notes: string | null;
  user: { id: string; displayName: string };
  edited: boolean;
  /** Authors edit their own logs; admins edit all. */
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
    notes: row.notes,
    user: row.user,
    edited: row._count.changes > 0,
    canEdit: viewer.role === 'admin' || row.user.id === viewer.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

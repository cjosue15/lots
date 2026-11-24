import type { Prisma } from '../generated/prisma/client.js';
import type { ProductInput } from './action-logs.schemas.js';

/** Snapshot stored in ActionLogChange.before / after. */
export interface LogSnapshot {
  name: string;
  phaseId: string | null;
  date: string;
  details: Prisma.JsonValue;
  /** Missing in changes saved before products had their own table. */
  products?: ProductInput[];
  notes: string | null;
}

export type ChangedField = 'name' | 'phase' | 'date' | 'details' | 'products' | 'notes';

export interface FieldChange {
  field: ChangedField;
  before: Prisma.JsonValue;
  after: Prisma.JsonValue;
}

const FIELDS: ReadonlyArray<[keyof LogSnapshot, ChangedField]> = [
  ['name', 'name'],
  ['phaseId', 'phase'],
  ['date', 'date'],
  ['details', 'details'],
  ['products', 'products'],
  ['notes', 'notes'],
];

/**
 * Fields that differ between two snapshots, in form order. Phase ids are
 * turned into readable labels ("3. Trasplante") so the client only displays.
 */
export function diffSnapshots(
  before: Partial<LogSnapshot>,
  after: Partial<LogSnapshot>,
  phaseLabel: (id: string) => string,
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const [key, field] of FIELDS) {
    const a = (before[key] ?? null) as Prisma.JsonValue;
    const b = (after[key] ?? null) as Prisma.JsonValue;
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (field === 'phase') {
      changes.push({
        field,
        before: typeof a === 'string' ? phaseLabel(a) : null,
        after: typeof b === 'string' ? phaseLabel(b) : null,
      });
    } else {
      changes.push({ field, before: a, after: b });
    }
  }
  return changes;
}

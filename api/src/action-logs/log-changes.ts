import type { Prisma } from '../generated/prisma/client.js';

/** Snapshot stored in ActionLogChange.before / after. */
export interface LogSnapshot {
  name: string;
  phaseId: string | null;
  date: string;
  details: Prisma.JsonValue;
  notes: string | null;
}

export type ChangedField = 'name' | 'phase' | 'date' | 'details' | 'notes';

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
    const a = before[key] ?? null;
    const b = after[key] ?? null;
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

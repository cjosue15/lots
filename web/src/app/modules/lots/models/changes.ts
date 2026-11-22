import { formatDay } from '../../../shared/peru-date';
import { DETAIL_LABELS, describeDetailValue } from './details';
import type { ChangedField, FieldChange } from './lot.model';

export const FIELD_LABELS: Record<ChangedField, string> = {
  name: 'Acción',
  phase: 'Fase',
  date: 'Fecha',
  details: 'Detalles',
  notes: 'Notas',
};

/** Readable value of one side of a change; empty values get a placeholder. */
export function describeChangeValue(field: ChangedField, value: unknown): string {
  if (isEmpty(value)) {
    return field === 'phase' ? 'Sin fase' : 'Vacío';
  }
  if (field === 'date' && typeof value === 'string') return formatDay(value);
  return String(value);
}

const isEmpty = (value: unknown) => value === null || value === undefined || value === '';

export interface ChangeLine {
  label: string;
  before: string;
  after: string;
  /** The field had no value before (shown without strikethrough). */
  wasEmpty: boolean;
}

/**
 * One line per changed field. Details are compared key by key, so editing the
 * dose shows only "Dosis", not every detail of the log.
 */
export function describeChange(fields: FieldChange[]): ChangeLine[] {
  return fields.flatMap(({ field, before, after }) => {
    if (field === 'details') return describeDetailsChange(before, after);
    return [
      {
        label: FIELD_LABELS[field],
        before: describeChangeValue(field, before),
        after: describeChangeValue(field, after),
        wasEmpty: isEmpty(before),
      },
    ];
  });
}

function describeDetailsChange(before: unknown, after: unknown): ChangeLine[] {
  const a = (before ?? {}) as Record<string, unknown>;
  const b = (after ?? {}) as Record<string, unknown>;
  const lines: ChangeLine[] = [];
  for (const [key, label] of Object.entries(DETAIL_LABELS)) {
    const from = describeDetailValue(key, a[key]);
    const to = describeDetailValue(key, b[key]);
    if (from === to) continue;
    lines.push({ label, before: from ?? 'Vacío', after: to ?? 'Vacío', wasEmpty: from === null });
  }
  return lines;
}

import { FERTILIZER_RESULTS } from './action.model';

/** Detail keys in form order, with their Spanish label. */
export const DETAIL_LABELS: Record<string, string> = {
  product: 'Producto',
  dose: 'Dosis',
  humidity: 'Humedad',
  result: 'Resultado',
  chemicalApplied: '¿Se aplicó químico?',
};

/** Readable value of one detail field, or null when it is empty. */
export function describeDetailValue(key: string, value: unknown): string | null {
  if (key === 'chemicalApplied') {
    return typeof value === 'boolean' ? (value ? 'Sí' : 'No') : null;
  }
  if (key === 'result' && (value === 'WORKED' || value === 'CHANGE')) {
    return FERTILIZER_RESULTS[value];
  }
  return typeof value === 'string' && value ? value : null;
}

/** Human-readable lines for a log's extra fields, in form order. */
export function describeDetails(details: Record<string, unknown> | null): string[] {
  if (!details) return [];
  const lines: string[] = [];
  for (const [key, label] of Object.entries(DETAIL_LABELS)) {
    const value = describeDetailValue(key, details[key]);
    if (value === null) continue;
    if (key === 'chemicalApplied') {
      lines.push(details[key] ? 'Se aplicó químico' : 'No se aplicó químico');
    } else {
      lines.push(`${label}: ${value}`);
    }
  }
  return lines;
}

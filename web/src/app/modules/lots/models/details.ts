import { FERTILIZER_RESULTS } from './action.model';

/** Human-readable lines for a log's extra fields, in form order. */
export function describeDetails(details: Record<string, unknown> | null): string[] {
  if (!details) return [];
  const lines: string[] = [];
  const text = (key: string) => (typeof details[key] === 'string' ? (details[key] as string) : null);

  if (text('product')) lines.push(`Producto: ${text('product')}`);
  if (text('dose')) lines.push(`Dosis: ${text('dose')}`);
  if (text('humidity')) lines.push(`Humedad: ${text('humidity')}`);
  if (details['result'] === 'WORKED' || details['result'] === 'CHANGE') {
    lines.push(`Resultado: ${FERTILIZER_RESULTS[details['result']]}`);
  } else if (text('result')) {
    lines.push(`Resultado: ${text('result')}`);
  }
  if (typeof details['chemicalApplied'] === 'boolean') {
    lines.push(details['chemicalApplied'] ? 'Se aplicó químico' : 'No se aplicó químico');
  }
  return lines;
}

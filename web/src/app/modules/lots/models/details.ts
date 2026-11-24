import { FERTILIZER_RESULTS } from './action.model';

/** Detail keys in form order, with their Spanish label. */
export const DETAIL_LABELS: Record<string, string> = {
  product: 'Producto',
  dose: 'Dosis',
  method: 'Forma de aplicación',
  humidity: 'Humedad',
  result: 'Resultado',
  chemicalApplied: '¿Se aplicó químico?',
};

/** Units a dose can be measured in, with the label the form shows. */
export const DOSE_UNITS = {
  ML: 'Mililitros',
  MG: 'Miligramos',
} as const;
export type DoseUnit = keyof typeof DOSE_UNITS;

/** How a product was applied, with its label. */
export const APPLICATION_METHODS = {
  SYSTEM: 'Por sistema',
  SPRAY: 'Fumigación',
} as const;
export type ApplicationMethod = keyof typeof APPLICATION_METHODS;

const DOSE_SYMBOLS: Record<DoseUnit, string> = { ML: 'ml', MG: 'mg' };

/** "250 ml": the amount with its unit's symbol. Older logs kept the dose as free text. */
function describeDose(details: Record<string, unknown>): string | null {
  const { dose, doseUnit } = details;
  if (typeof dose === 'string') return dose || null;
  if (typeof dose !== 'number') return null;
  const amount = dose.toLocaleString('es-PE', { maximumFractionDigits: 3 });
  const symbol = DOSE_SYMBOLS[doseUnit as DoseUnit];
  return symbol ? `${amount} ${symbol}` : amount;
}

/**
 * Readable value of one detail field, or null when it is empty. Takes the whole
 * details object because the dose reads its unit from `doseUnit`.
 */
export function describeDetailValue(key: string, details: Record<string, unknown>): string | null {
  const value = details[key];
  if (key === 'dose') return describeDose(details);
  if (key === 'method') return APPLICATION_METHODS[value as ApplicationMethod] ?? null;
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
    const value = describeDetailValue(key, details);
    if (value === null) continue;
    if (key === 'chemicalApplied') {
      lines.push(details[key] ? 'Se aplicó químico' : 'No se aplicó químico');
    } else {
      lines.push(`${label}: ${value}`);
    }
  }
  return lines;
}

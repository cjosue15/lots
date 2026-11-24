import { FERTILIZER_RESULTS } from './action.model';
import type { ActionLog, ApplicationMethod, ApplicationProduct, DoseUnit } from './lot.model';

/**
 * Detail keys in form order, with their Spanish label. product, dose and
 * method only appear in logs saved before products had their own table.
 */
export const DETAIL_LABELS: Record<string, string> = {
  product: 'Producto',
  dose: 'Dosis',
  method: 'Forma de aplicación',
  humidity: 'Humedad',
  result: 'Resultado',
  chemicalApplied: '¿Se aplicó químico?',
};

/** Units a dose can be measured in, with the label the form shows. */
export const DOSE_UNITS: Record<DoseUnit, string> = {
  L: 'Litros',
  ML: 'Mililitros',
  KG: 'Kilos',
  G: 'Gramos',
  MG: 'Miligramos',
};

/** Units of the same kind as a product's unit (volume or weight), largest first. */
export function unitsLike(unit: DoseUnit): DoseUnit[] {
  return unit === 'L' || unit === 'ML' ? ['L', 'ML'] : ['KG', 'G', 'MG'];
}

/** How a product was applied, with its label. */
export const APPLICATION_METHODS: Record<ApplicationMethod, string> = {
  SYSTEM: 'Por sistema',
  SPRAY: 'Fumigación',
};

export const DOSE_SYMBOLS: Record<DoseUnit, string> = { L: 'L', ML: 'ml', KG: 'kg', G: 'g', MG: 'mg' };

/** "2,5 L": an amount with its unit's symbol. */
export function formatAmount(amount: number, unit: DoseUnit): string {
  return `${amount.toLocaleString('es-PE', { maximumFractionDigits: 3 })} ${DOSE_SYMBOLS[unit]}`;
}

/** "250 ml": the amount with its unit's symbol. Older logs kept the dose as free text. */
function describeDose({ dose, doseUnit }: { dose?: unknown; doseUnit?: unknown }): string | null {
  if (typeof dose === 'string') return dose || null;
  if (typeof dose !== 'number') return null;
  const amount = dose.toLocaleString('es-PE', { maximumFractionDigits: 3 });
  const symbol = DOSE_SYMBOLS[doseUnit as DoseUnit];
  return symbol ? `${amount} ${symbol}` : amount;
}

/** "Bayfolan: 250 ml, por sistema". */
export function describeProduct(p: ApplicationProduct): string {
  const dose = describeDose(p);
  const method = p.method ? APPLICATION_METHODS[p.method].toLowerCase() : null;
  const extra = [dose, method].filter(Boolean).join(', ');
  return extra ? `${p.product}: ${extra}` : p.product;
}

/** Everything a log recorded beyond its name: products first, then details. */
export function describeLogDetails(log: Pick<ActionLog, 'details' | 'products'>): string[] {
  return [...log.products.map(describeProduct), ...describeDetails(log.details)];
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

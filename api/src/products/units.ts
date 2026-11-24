import { DoseUnit } from '../generated/prisma/client.js';

/** Units a product can be measured in (its stock unit). */
export const STOCK_UNITS = [DoseUnit.L, DoseUnit.KG, DoseUnit.G] as const;
export type StockUnit = (typeof STOCK_UNITS)[number];

/** Size of each unit in the smallest unit of its kind (ml or mg). */
const BASE: Record<DoseUnit, { kind: 'volume' | 'weight'; factor: number }> = {
  L: { kind: 'volume', factor: 1000 },
  ML: { kind: 'volume', factor: 1 },
  KG: { kind: 'weight', factor: 1_000_000 },
  G: { kind: 'weight', factor: 1000 },
  MG: { kind: 'weight', factor: 1 },
};

/** True when `unit` can be converted to `stockUnit` (same kind: volume or weight). */
export function sameKind(unit: DoseUnit, stockUnit: DoseUnit): boolean {
  return BASE[unit].kind === BASE[stockUnit].kind;
}

/**
 * `amount` of `unit` expressed in `stockUnit`, for example 250 ML in L is 0.25.
 * Rounded to 6 decimals so float noise does not pile up in the ledger.
 */
export function convert(
  amount: number,
  unit: DoseUnit,
  stockUnit: DoseUnit,
): number {
  if (!sameKind(unit, stockUnit)) {
    throw new Error(`Cannot convert ${unit} to ${stockUnit}`);
  }
  return round((amount * BASE[unit].factor) / BASE[stockUnit].factor);
}

export function round(value: number, decimals = 6): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

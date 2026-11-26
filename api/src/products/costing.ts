import { round } from './units.js';

/** A priced movement (INITIAL or ENTRY) of one product. */
export interface PricedEntry {
  /** `YYYY-MM-DD`. */
  date: string;
  quantity: number;
  unitCost: number;
}

/**
 * Average price per unit as of `date`: only entries on or before that day
 * count, so later purchases never change what a past application cost (PLAN
 * §14, "Costo"). Weighted by quantity; a plain average when nothing came in.
 * Null when no entry is that old.
 */
export function averageCostOn(
  entries: PricedEntry[],
  date: string,
): number | null {
  const known = entries.filter((entry) => entry.date <= date);
  if (!known.length) return null;
  const quantity = known.reduce((sum, entry) => sum + entry.quantity, 0);
  if (quantity <= 0) {
    return known.reduce((sum, entry) => sum + entry.unitCost, 0) / known.length;
  }
  return (
    known.reduce((sum, entry) => sum + entry.quantity * entry.unitCost, 0) /
    quantity
  );
}

/**
 * Cost of using `quantity` (positive, in the product's unit) on `date`. Used
 * before its first entry (the invoice was registered later, with a later
 * date), it takes the price of that first entry. Null with no entries at all.
 */
export function applicationCost(
  entries: PricedEntry[],
  date: string,
  quantity: number,
): number | null {
  const first = entries.reduce<string | null>(
    (min, entry) => (min === null || entry.date < min ? entry.date : min),
    null,
  );
  if (first === null) return null;
  const price = averageCostOn(entries, date < first ? first : date)!;
  return round(quantity * price, 2);
}

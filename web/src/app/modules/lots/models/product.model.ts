import type { DoseUnit } from './lot.model';

/** A catalog product as the application form shows it (no prices). */
export interface CatalogProduct {
  id: string;
  name: string;
  /** L, KG or G. */
  unit: DoseUnit;
  category: { id: string; name: string };
  /** In the greenhouse of the lot being logged. */
  stock: number;
}

import type { DoseUnit } from '../../lots/models/lot.model';
import type { CatalogProduct } from '../../lots/models/product.model';

/** OUT: zero or negative stock. LOW: below the minimum. */
export type StockStatus = 'OK' | 'LOW' | 'OUT';

export type StockMovementType = 'INITIAL' | 'ENTRY' | 'APPLICATION' | 'ADJUSTMENT';

export interface AdminProduct extends CatalogProduct {
  minStock: number;
  active: boolean;
  status: StockStatus;
  /** Per product unit, weighted by quantity. */
  averageCost: number | null;
  /** Day of its initial count. */
  startDate: string;
}

export interface AdminCategory {
  id: string;
  name: string;
  active: boolean;
  productCount: number;
}

export interface AdminProducts {
  products: AdminProduct[];
  categories: AdminCategory[];
}

export interface ProductMovement {
  id: string;
  date: string;
  type: StockMovementType;
  /** Signed, in the product's unit. */
  quantity: number;
  unitCost: number | null;
  balance: number;
  reason: string | null;
  user: { id: string; displayName: string };
  log: { id: string; name: string; lot: { number: number; greenhouse: string } } | null;
  createdAt: string;
}

export interface ProductDetail extends AdminProduct {
  /** Newest first. */
  movements: ProductMovement[];
}

export interface CreateProductInput {
  name: string;
  categoryId: string;
  unit: DoseUnit;
  minStock: number;
  initialStock: number;
  unitCost: number;
  date: string;
}

export interface UpdateProductInput {
  name?: string;
  categoryId?: string;
  minStock?: number;
  active?: boolean;
}

/** Units a product can be bought in. */
export const STOCK_UNITS: Partial<Record<DoseUnit, string>> = {
  L: 'Litros (L)',
  KG: 'Kilos (kg)',
  G: 'Gramos (g)',
};

export const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  INITIAL: 'Stock inicial',
  ENTRY: 'Ingreso',
  APPLICATION: 'Aplicación',
  ADJUSTMENT: 'Ajuste',
};

/** "S/ 30,00" */
export function formatMoney(amount: number): string {
  return `S/ ${amount.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

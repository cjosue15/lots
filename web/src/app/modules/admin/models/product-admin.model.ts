import type { DoseUnit } from '../../lots/models/lot.model';

/** OUT: zero or negative stock. LOW: below the minimum. */
export type StockStatus = 'OK' | 'LOW' | 'OUT';

export type StockMovementType = 'INITIAL' | 'ENTRY' | 'APPLICATION' | 'ADJUSTMENT';

export interface GreenhouseRef {
  id: string;
  name: string;
}

/** A product's stock in one greenhouse (PLAN §14: each greenhouse has its own). */
export interface GreenhouseStock {
  greenhouse: GreenhouseRef;
  stock: number;
  minStock: number;
  status: StockStatus;
  /** Day of its first movement there, of any kind; null while it has none. */
  startDate: string | null;
  /**
   * Day of its initial count there (go-live). Applications before it don't
   * touch stock; entries and adjustments can't go before it.
   */
  initialDate: string | null;
}

export interface AdminProduct {
  id: string;
  name: string;
  /** L, KG or G. */
  unit: DoseUnit;
  category: { id: string; name: string };
  active: boolean;
  /** Per product unit, weighted by quantity, across all greenhouses. */
  averageCost: number | null;
  /** One per greenhouse, in the order of `AdminProducts.greenhouses`. */
  greenhouses: GreenhouseStock[];
}

export interface AdminCategory {
  id: string;
  name: string;
  active: boolean;
  productCount: number;
}

export interface AdminProducts {
  greenhouses: GreenhouseRef[];
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
  greenhouse: GreenhouseRef;
  /** Stock of its greenhouse right after this movement. */
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

export interface MinStockInput {
  greenhouseId: string;
  minStock: number;
}

/** A new product has no stock: it comes in with its entries. */
export interface CreateProductInput {
  name: string;
  categoryId: string;
  unit: DoseUnit;
  minimums: MinStockInput[];
}

export interface UpdateProductInput {
  name?: string;
  categoryId?: string;
  minimums?: MinStockInput[];
  active?: boolean;
}

/**
 * Whether a greenhouse uses the product: it has movements there or a minimum.
 * Only those raise alerts; elsewhere 0 just means it is not used.
 */
export function usesProduct(stock: GreenhouseStock): boolean {
  return stock.startDate !== null || stock.minStock > 0;
}

/** The alert of a greenhouse's stock, or null when fine or not used there. */
export function stockAlert(stock: GreenhouseStock): 'OUT' | 'LOW' | null {
  if (!usesProduct(stock) || stock.status === 'OK') return null;
  return stock.status;
}

export const ALERT_LABELS: Record<'OUT' | 'LOW', string> = {
  OUT: 'Sin stock',
  LOW: 'Bajo mínimo',
};

/** Units a product can be bought in. */
export const STOCK_UNITS: Partial<Record<DoseUnit, string>> = {
  L: 'Litros (L)',
  KG: 'Kilos (kg)',
  G: 'Gramos (g)',
};

export const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  INITIAL: 'Inventario inicial',
  ENTRY: 'Ingreso',
  APPLICATION: 'Aplicación',
  ADJUSTMENT: 'Ajuste',
};

/** "S/ 30,00" */
export function formatMoney(amount: number): string {
  return `S/ ${amount.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface ProductCost {
  productId: string;
  name: string;
  unit: DoseUnit;
  /** Total used, in the product's unit. */
  quantity: number;
  cost: number;
}

/** What a cycle's applications cost; most expensive product first. */
export interface CycleCost {
  total: number;
  products: ProductCost[];
}

export interface CycleCostRow {
  cycle: {
    id: string;
    number: number;
    status: 'ACTIVE' | 'CLOSED';
    startDate: string;
    endDate: string | null;
  };
  lot: { id: string; number: number; greenhouse: string };
  total: number;
  /** Logs with at least one priced product. */
  applications: number;
}

export interface CostReport {
  total: number;
  cycles: CycleCostRow[];
  products: ProductCost[];
}

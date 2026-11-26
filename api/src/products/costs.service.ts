import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type DoseUnit,
  Prisma,
  StockMovementType,
} from '../generated/prisma/client.js';
import { fromDbDate, toDbDate } from '../common/peru-date.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { applicationCost, type PricedEntry } from './costing.js';
import { round } from './units.js';

export interface ProductCost {
  productId: string;
  name: string;
  unit: DoseUnit;
  /** Total used, in the product's unit. */
  quantity: number;
  cost: number;
}

export interface CycleCost {
  total: number;
  /** Most expensive first. */
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
  applications: number;
}

export interface CostReport {
  total: number;
  /** By greenhouse, lot and cycle number. */
  cycles: CycleCostRow[];
  /** Most expensive first. */
  products: ProductCost[];
}

const applicationSelect = {
  productId: true,
  date: true,
  quantity: true,
  product: { select: { name: true, unit: true } },
  actionLogProduct: {
    select: {
      actionLog: {
        select: {
          id: true,
          cycle: {
            select: {
              id: true,
              number: true,
              status: true,
              startDate: true,
              endDate: true,
              lot: {
                select: {
                  id: true,
                  number: true,
                  greenhouse: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.StockMovementSelect;

type ApplicationRow = Prisma.StockMovementGetPayload<{
  select: typeof applicationSelect;
}>;

/**
 * What applications cost (PLAN §14, "Costo"): quantity used × the product's
 * average price as of the application day. Calculated on demand, never stored.
 * Admin only.
 */
@Injectable()
export class CostsService {
  constructor(private readonly prisma: PrismaService) {}

  async cycle(cycleId: string): Promise<CycleCost> {
    const cycle = await this.prisma.cycle.findUnique({
      where: { id: cycleId },
    });
    if (!cycle) throw new NotFoundException('El ciclo no existe');
    const priced = await this.priceApplications({
      actionLogProduct: { actionLog: { cycleId } },
    });
    const products = byProduct(priced);
    return { total: sum(products.map((p) => p.cost)), products };
  }

  /** Applications dated between `from` and `to` (both optional, inclusive). */
  async report(from?: string, to?: string): Promise<CostReport> {
    const priced = await this.priceApplications({
      date: {
        gte: from ? toDbDate(from) : undefined,
        lte: to ? toDbDate(to) : undefined,
      },
    });

    const cycles = new Map<string, CycleCostRow & { logs: Set<string> }>();
    for (const { row, cost } of priced) {
      const log = row.actionLogProduct!.actionLog;
      const { lot, ...cycle } = log.cycle;
      const entry = cycles.get(cycle.id) ?? {
        cycle: {
          ...cycle,
          startDate: fromDbDate(cycle.startDate),
          endDate: cycle.endDate ? fromDbDate(cycle.endDate) : null,
        },
        lot: {
          id: lot.id,
          number: lot.number,
          greenhouse: lot.greenhouse.name,
        },
        total: 0,
        applications: 0,
        logs: new Set<string>(),
      };
      entry.total = round(entry.total + cost, 2);
      entry.logs.add(log.id);
      entry.applications = entry.logs.size;
      cycles.set(cycle.id, entry);
    }

    const rows = [...cycles.values()]
      .map(({ logs: _logs, ...row }) => row)
      .sort(
        (a, b) =>
          a.lot.greenhouse.localeCompare(b.lot.greenhouse, 'es') ||
          a.lot.number - b.lot.number ||
          b.cycle.number - a.cycle.number,
      );
    const products = byProduct(priced);
    return { total: sum(products.map((p) => p.cost)), cycles: rows, products };
  }

  /** Application movements matching `where`, each with its cost. */
  private async priceApplications(
    where: Prisma.StockMovementWhereInput,
  ): Promise<{ row: ApplicationRow; cost: number }[]> {
    const rows = await this.prisma.stockMovement.findMany({
      where: {
        ...where,
        type: StockMovementType.APPLICATION,
        actionLogProductId: { not: null },
      },
      select: applicationSelect,
    });
    if (!rows.length) return [];

    const entries = await this.prisma.stockMovement.findMany({
      where: {
        productId: { in: [...new Set(rows.map((row) => row.productId))] },
        type: { in: [StockMovementType.INITIAL, StockMovementType.ENTRY] },
        unitCost: { not: null },
      },
      select: { productId: true, date: true, quantity: true, unitCost: true },
    });
    const byId = new Map<string, PricedEntry[]>();
    for (const entry of entries) {
      byId.set(entry.productId, [
        ...(byId.get(entry.productId) ?? []),
        {
          date: fromDbDate(entry.date),
          quantity: entry.quantity,
          unitCost: entry.unitCost!,
        },
      ]);
    }

    return rows.map((row) => ({
      row,
      // Movements are negative. 0 only while the product has no entry at all.
      cost:
        applicationCost(
          byId.get(row.productId) ?? [],
          fromDbDate(row.date),
          -row.quantity,
        ) ?? 0,
    }));
  }
}

function byProduct(
  priced: { row: ApplicationRow; cost: number }[],
): ProductCost[] {
  const products = new Map<string, ProductCost>();
  for (const { row, cost } of priced) {
    const product = products.get(row.productId) ?? {
      productId: row.productId,
      name: row.product.name,
      unit: row.product.unit,
      quantity: 0,
      cost: 0,
    };
    product.quantity = round(product.quantity - row.quantity);
    product.cost = round(product.cost + cost, 2);
    products.set(row.productId, product);
  }
  return [...products.values()].sort((a, b) => b.cost - a.cost);
}

function sum(values: number[]): number {
  return round(
    values.reduce((total, value) => total + value, 0),
    2,
  );
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type ApplicationMethod,
  type DoseUnit,
  Prisma,
  StockMovementType,
} from '../generated/prisma/client.js';
import { fromDbDate, todayInPeru, toDbDate } from '../common/peru-date.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateCategory,
  CreateProduct,
  StockAdjustment,
  StockEntry,
  UpdateCategory,
  UpdateProduct,
} from './products.schemas.js';
import { convert, round, sameKind } from './units.js';

/** What engineers see when picking a product: never prices. */
export interface CatalogProduct {
  id: string;
  name: string;
  unit: DoseUnit;
  category: { id: string; name: string };
  stock: number;
}

/** OUT: zero or negative stock. LOW: below the minimum. */
export type StockStatus = 'OK' | 'LOW' | 'OUT';

export interface AdminProduct extends CatalogProduct {
  minStock: number;
  active: boolean;
  status: StockStatus;
  /** Weighted average of the INITIAL and ENTRY prices, per product unit. */
  averageCost: number | null;
  /** Day of its INITIAL movement: applications before it do not touch stock. */
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
  quantity: number;
  unitCost: number | null;
  /** Stock right after this movement. */
  balance: number;
  reason: string | null;
  user: { id: string; displayName: string };
  /** APPLICATION only: where it was used. */
  log: {
    id: string;
    name: string;
    lot: { number: number; greenhouse: string };
  } | null;
  createdAt: Date;
}

export interface ProductDetail extends AdminProduct {
  /** Newest first. */
  movements: ProductMovement[];
}

/** One product of an application as the log sends it. */
export interface AppliedProductInput {
  productId: string;
  dose: number | null;
  doseUnit: DoseUnit | null;
  method: ApplicationMethod | null;
}

/** The ActionLogProduct row to create, with its stock movement when it uses stock. */
export interface AppliedProductRow {
  productId: string;
  product: string;
  dose: number | null;
  doseUnit: DoseUnit | null;
  method: ApplicationMethod | null;
  movement: { quantity: number } | null;
}

const productSelect = {
  id: true,
  name: true,
  unit: true,
  minStock: true,
  active: true,
  category: { select: { id: true, name: true } },
} satisfies Prisma.ProductSelect;

type ProductRow = Prisma.ProductGetPayload<{ select: typeof productSelect }>;

const UNIT_KIND: Record<DoseUnit, string> = {
  L: 'volumen (L o ml)',
  ML: 'volumen (L o ml)',
  KG: 'peso (kg, g o mg)',
  G: 'peso (kg, g o mg)',
  MG: 'peso (kg, g o mg)',
};

/**
 * Product catalog and stock ledger (PLAN §14). Stock is the sum of a product's
 * movements; nothing else stores it.
 */
@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active products for the application form, with their stock. */
  async catalog(): Promise<CatalogProduct[]> {
    const products = await this.prisma.product.findMany({
      where: { active: true },
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
      select: productSelect,
    });
    const stock = await this.stockByProduct(products.map((p) => p.id));
    return products.map(({ id, name, unit, category }) => ({
      id,
      name,
      unit,
      category,
      stock: stock.get(id) ?? 0,
    }));
  }

  async adminList(): Promise<AdminProducts> {
    const [products, categories] = await Promise.all([
      this.prisma.product.findMany({
        orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
        select: productSelect,
      }),
      this.prisma.productCategory.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          active: true,
          _count: { select: { products: true } },
        },
      }),
    ]);
    const ids = products.map((p) => p.id);
    const [stock, costs, starts] = await Promise.all([
      this.stockByProduct(ids),
      this.averageCosts(ids),
      this.startDates(ids),
    ]);
    return {
      products: products.map((row) =>
        this.toAdminProduct(
          row,
          stock.get(row.id) ?? 0,
          costs.get(row.id),
          starts.get(row.id),
        ),
      ),
      categories: categories.map(({ _count, ...category }) => ({
        ...category,
        productCount: _count.products,
      })),
    };
  }

  async detail(id: string): Promise<ProductDetail> {
    const row = await this.prisma.product.findUnique({
      where: { id },
      select: productSelect,
    });
    if (!row) throw new NotFoundException('El producto no existe');

    const movements = await this.prisma.stockMovement.findMany({
      where: { productId: id },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        date: true,
        type: true,
        quantity: true,
        unitCost: true,
        reason: true,
        createdAt: true,
        user: { select: { id: true, displayName: true } },
        actionLogProduct: {
          select: {
            actionLog: {
              select: {
                id: true,
                name: true,
                cycle: {
                  select: {
                    lot: {
                      select: {
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
      },
    });

    let balance = 0;
    const ledger: ProductMovement[] = movements.map(
      ({ actionLogProduct, ...movement }) => {
        balance = round(balance + movement.quantity);
        const log = actionLogProduct?.actionLog;
        return {
          ...movement,
          date: fromDbDate(movement.date),
          balance,
          log: log
            ? {
                id: log.id,
                name: log.name,
                lot: {
                  number: log.cycle.lot.number,
                  greenhouse: log.cycle.lot.greenhouse.name,
                },
              }
            : null,
        };
      },
    );

    const initial = movements.find((m) => m.type === StockMovementType.INITIAL);
    return {
      ...this.toAdminProduct(
        row,
        balance,
        averageCost(movements),
        initial ? fromDbDate(initial.date) : undefined,
      ),
      movements: ledger.reverse(),
    };
  }

  async create(body: CreateProduct, userId: string): Promise<ProductDetail> {
    this.assertNotFuture(body.date);
    await this.assertCategory(body.categoryId);
    const product = await this.uniqueName(() =>
      this.prisma.product.create({
        data: {
          name: body.name,
          categoryId: body.categoryId,
          unit: body.unit,
          minStock: body.minStock,
          movements: {
            create: {
              type: StockMovementType.INITIAL,
              date: toDbDate(body.date),
              quantity: body.initialStock,
              unitCost: body.unitCost,
              userId,
            },
          },
        },
      }),
    );
    return this.detail(product.id);
  }

  async update(id: string, body: UpdateProduct): Promise<ProductDetail> {
    await this.assertProduct(id);
    if (body.categoryId) await this.assertCategory(body.categoryId);
    await this.uniqueName(() =>
      this.prisma.product.update({ where: { id }, data: body }),
    );
    return this.detail(id);
  }

  async addEntry(
    id: string,
    body: StockEntry,
    userId: string,
  ): Promise<ProductDetail> {
    await this.assertMovementDate(id, body.date);
    await this.prisma.stockMovement.create({
      data: {
        productId: id,
        type: StockMovementType.ENTRY,
        date: toDbDate(body.date),
        quantity: body.quantity,
        unitCost: body.unitCost,
        userId,
      },
    });
    return this.detail(id);
  }

  /** Stores the difference between the counted stock and the app's stock. */
  async adjust(
    id: string,
    body: StockAdjustment,
    userId: string,
  ): Promise<ProductDetail> {
    await this.assertMovementDate(id, body.date);
    const stock = (await this.stockByProduct([id])).get(id) ?? 0;
    const quantity = round(body.counted - stock);
    if (quantity === 0) {
      throw new BadRequestException(
        'El stock contado es igual al de la app; no hay nada que ajustar',
      );
    }
    await this.prisma.stockMovement.create({
      data: {
        productId: id,
        type: StockMovementType.ADJUSTMENT,
        date: toDbDate(body.date),
        quantity,
        reason: body.reason,
        userId,
      },
    });
    return this.detail(id);
  }

  async createCategory({ name }: CreateCategory): Promise<AdminProducts> {
    await this.uniqueName(
      () => this.prisma.productCategory.create({ data: { name } }),
      'Ya existe una categoría con ese nombre',
    );
    return this.adminList();
  }

  async updateCategory(
    id: string,
    body: UpdateCategory,
  ): Promise<AdminProducts> {
    await this.assertCategory(id, false);
    await this.uniqueName(
      () => this.prisma.productCategory.update({ where: { id }, data: body }),
      'Ya existe una categoría con ese nombre',
    );
    return this.adminList();
  }

  /**
   * Checks the products of an application and works out what each one takes
   * from stock. `allowed` are products already on the log, kept even if they
   * were deactivated since. No movement when there is no dose, or when the log
   * is dated before the product's start (that use is already in its count).
   */
  async applicationRows(
    inputs: AppliedProductInput[],
    date: string,
    allowed: ReadonlySet<string> = new Set(),
  ): Promise<AppliedProductRow[]> {
    if (!inputs.length) return [];
    const ids = [...new Set(inputs.map((input) => input.productId))];
    const [products, starts] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, unit: true, active: true },
      }),
      this.startDates(ids),
    ]);
    const byId = new Map(products.map((product) => [product.id, product]));

    return inputs.map((input) => {
      const product = byId.get(input.productId);
      if (!product || (!product.active && !allowed.has(product.id))) {
        throw new BadRequestException(
          'El producto no existe o ya no está disponible',
        );
      }
      if (input.doseUnit && !sameKind(input.doseUnit, product.unit)) {
        throw new BadRequestException(
          `La cantidad de ${product.name} debe estar en ${UNIT_KIND[product.unit]}`,
        );
      }
      const start = starts.get(product.id);
      const usesStock =
        input.dose !== null &&
        input.doseUnit !== null &&
        start !== undefined &&
        date >= start;
      return {
        productId: product.id,
        product: product.name,
        dose: input.dose,
        doseUnit: input.doseUnit,
        method: input.method,
        movement: usesStock
          ? { quantity: -convert(input.dose!, input.doseUnit!, product.unit) }
          : null,
      };
    });
  }

  private toAdminProduct(
    row: ProductRow,
    stock: number,
    averageCost: number | null | undefined,
    startDate: string | undefined,
  ): AdminProduct {
    return {
      ...row,
      stock,
      status: stockStatus(stock, row.minStock),
      averageCost: averageCost ?? null,
      startDate: startDate ?? '',
    };
  }

  private async stockByProduct(ids: string[]): Promise<Map<string, number>> {
    const sums = await this.prisma.stockMovement.groupBy({
      by: ['productId'],
      where: { productId: { in: ids } },
      _sum: { quantity: true },
    });
    return new Map(
      sums.map((sum) => [sum.productId, round(sum._sum.quantity ?? 0)]),
    );
  }

  private async averageCosts(
    ids: string[],
  ): Promise<Map<string, number | null>> {
    const entries = await this.prisma.stockMovement.findMany({
      where: { productId: { in: ids }, unitCost: { not: null } },
      select: { productId: true, type: true, quantity: true, unitCost: true },
    });
    const grouped = new Map<string, typeof entries>();
    for (const entry of entries) {
      grouped.set(entry.productId, [
        ...(grouped.get(entry.productId) ?? []),
        entry,
      ]);
    }
    return new Map([...grouped].map(([id, rows]) => [id, averageCost(rows)]));
  }

  private async startDates(ids: string[]): Promise<Map<string, string>> {
    const initials = await this.prisma.stockMovement.findMany({
      where: { productId: { in: ids }, type: StockMovementType.INITIAL },
      select: { productId: true, date: true },
    });
    return new Map(initials.map((m) => [m.productId, fromDbDate(m.date)]));
  }

  private async assertProduct(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('El producto no existe');
    return product;
  }

  private async assertCategory(id: string, mustBeActive = true): Promise<void> {
    const category = await this.prisma.productCategory.findUnique({
      where: { id },
    });
    if (!category || (mustBeActive && !category.active)) {
      throw new NotFoundException('La categoría no existe');
    }
  }

  /** Entries and adjustments go between the product's start and today. */
  private async assertMovementDate(id: string, date: string): Promise<void> {
    await this.assertProduct(id);
    this.assertNotFuture(date);
    const start = (await this.startDates([id])).get(id);
    if (start && date < start) {
      throw new BadRequestException(
        `La fecha es anterior al inicio del producto (${start})`,
      );
    }
  }

  private assertNotFuture(date: string): void {
    if (date > todayInPeru()) {
      throw new BadRequestException('La fecha no puede ser posterior a hoy');
    }
  }

  private async uniqueName<T>(
    write: () => Promise<T>,
    message = 'Ya existe un producto con ese nombre',
  ): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(message);
      }
      throw error;
    }
  }
}

export function stockStatus(stock: number, minStock: number): StockStatus {
  if (stock <= 0) return 'OUT';
  if (stock < minStock) return 'LOW';
  return 'OK';
}

/**
 * Weighted by quantity. Movements with no quantity (a product created with 0
 * stock) still count, as a plain average, so it always has a price.
 */
export function averageCost(
  movements: {
    type: StockMovementType;
    quantity: number;
    unitCost: number | null;
  }[],
): number | null {
  const priced = movements.filter(
    (m): m is typeof m & { unitCost: number } =>
      m.unitCost !== null &&
      (m.type === StockMovementType.INITIAL ||
        m.type === StockMovementType.ENTRY),
  );
  if (!priced.length) return null;
  const quantity = priced.reduce((sum, m) => sum + m.quantity, 0);
  if (quantity <= 0) {
    return round(
      priced.reduce((sum, m) => sum + m.unitCost, 0) / priced.length,
      4,
    );
  }
  return round(
    priced.reduce((sum, m) => sum + m.quantity * m.unitCost, 0) / quantity,
    4,
  );
}

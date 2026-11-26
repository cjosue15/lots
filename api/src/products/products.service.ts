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
  /** In the greenhouse of the lot being logged. */
  stock: number;
}

/** OUT: zero or negative stock. LOW: below the minimum. */
export type StockStatus = 'OK' | 'LOW' | 'OUT';

export interface GreenhouseRef {
  id: string;
  name: string;
}

/** A product's stock in one greenhouse. */
export interface GreenhouseStock {
  greenhouse: GreenhouseRef;
  stock: number;
  minStock: number;
  status: StockStatus;
  /**
   * Day of its first movement in this greenhouse: applications before it do
   * not touch stock. Null while nothing came in there.
   */
  startDate: string | null;
}

export interface AdminProduct {
  id: string;
  name: string;
  unit: DoseUnit;
  category: { id: string; name: string };
  active: boolean;
  /** Weighted average of the INITIAL and ENTRY prices of all greenhouses, per product unit. */
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
  quantity: number;
  unitCost: number | null;
  greenhouse: GreenhouseRef;
  /** Stock of its greenhouse right after this movement. */
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

/** Per product and greenhouse, keyed by `stockKey`. */
export interface StockFigures {
  stock: ReadonlyMap<string, number>;
  minimums: ReadonlyMap<string, number>;
  starts: ReadonlyMap<string, string>;
}

const productSelect = {
  id: true,
  name: true,
  unit: true,
  active: true,
  category: { select: { id: true, name: true } },
} satisfies Prisma.ProductSelect;


const UNIT_KIND: Record<DoseUnit, string> = {
  L: 'volumen (L o ml)',
  ML: 'volumen (L o ml)',
  KG: 'peso (kg, g o mg)',
  G: 'peso (kg, g o mg)',
  MG: 'peso (kg, g o mg)',
};

/**
 * Product catalog and stock ledger (PLAN §14). Stock is the sum of a product's
 * movements in each greenhouse; nothing else stores it. Prices are global.
 */
@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active products for the application form, with their stock in the lot's greenhouse. */
  async catalog(lotId: string): Promise<CatalogProduct[]> {
    const lot = await this.prisma.lot.findUnique({
      where: { id: lotId },
      select: { greenhouseId: true },
    });
    if (!lot) throw new NotFoundException('El lote no existe');

    const products = await this.prisma.product.findMany({
      where: { active: true },
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
      select: productSelect,
    });
    const stock = await this.stockByKey(
      products.map((p) => p.id),
      lot.greenhouseId,
    );
    return products.map(({ id, name, unit, category }) => ({
      id,
      name,
      unit,
      category,
      stock: stock.get(stockKey(id, lot.greenhouseId)) ?? 0,
    }));
  }

  async adminList(): Promise<AdminProducts> {
    const [products, categories, greenhouses] = await Promise.all([
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
      this.greenhouses(),
    ]);
    const ids = products.map((p) => p.id);
    const [figures, costs] = await Promise.all([
      this.figures(ids),
      this.averageCosts(ids),
    ]);
    return {
      greenhouses,
      products: products.map((row) => ({
        ...row,
        averageCost: costs.get(row.id) ?? null,
        greenhouses: greenhouseStocks(row.id, greenhouses, figures),
      })),
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

    const [movements, greenhouses, figures] = await Promise.all([
      this.prisma.stockMovement.findMany({
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
          greenhouse: { select: { id: true, name: true } },
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
      }),
      this.greenhouses(),
      this.figures([id]),
    ]);

    // Each greenhouse keeps its own running balance.
    const balances = new Map<string, number>();
    const ledger: ProductMovement[] = movements.map(
      ({ actionLogProduct, ...movement }) => {
        const balance = round(
          (balances.get(movement.greenhouse.id) ?? 0) + movement.quantity,
        );
        balances.set(movement.greenhouse.id, balance);
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

    return {
      ...row,
      averageCost: averageCost(movements),
      greenhouses: greenhouseStocks(id, greenhouses, figures),
      movements: ledger.reverse(),
    };
  }

  async create(body: CreateProduct): Promise<ProductDetail> {
    await this.assertCategory(body.categoryId);
    await this.assertGreenhouses(body.minimums.map((m) => m.greenhouseId));
    const product = await this.uniqueName(() =>
      this.prisma.product.create({
        data: {
          name: body.name,
          categoryId: body.categoryId,
          unit: body.unit,
          minimums: { create: body.minimums },
        },
      }),
    );
    return this.detail(product.id);
  }

  async update(id: string, body: UpdateProduct): Promise<ProductDetail> {
    await this.assertProduct(id);
    if (body.categoryId) await this.assertCategory(body.categoryId);
    const { minimums = [], ...data } = body;
    await this.assertGreenhouses(minimums.map((m) => m.greenhouseId));
    await this.uniqueName(() =>
      this.prisma.$transaction([
        this.prisma.product.update({ where: { id }, data }),
        ...minimums.map(({ greenhouseId, minStock }) =>
          this.prisma.productGreenhouse.upsert({
            where: { productId_greenhouseId: { productId: id, greenhouseId } },
            update: { minStock },
            create: { productId: id, greenhouseId, minStock },
          }),
        ),
      ]),
    );
    return this.detail(id);
  }

  async addEntry(
    id: string,
    body: StockEntry,
    userId: string,
  ): Promise<ProductDetail> {
    await this.assertMovementDate(id, body.greenhouseId, body.date);
    await this.prisma.stockMovement.create({
      data: {
        productId: id,
        greenhouseId: body.greenhouseId,
        type: StockMovementType.ENTRY,
        date: toDbDate(body.date),
        quantity: body.quantity,
        unitCost: body.unitCost,
        userId,
      },
    });
    return this.detail(id);
  }

  /** Stores the difference between the counted stock and the app's stock in that greenhouse. */
  async adjust(
    id: string,
    body: StockAdjustment,
    userId: string,
  ): Promise<ProductDetail> {
    await this.assertMovementDate(id, body.greenhouseId, body.date);
    const stock =
      (await this.stockByKey([id], body.greenhouseId)).get(
        stockKey(id, body.greenhouseId),
      ) ?? 0;
    const quantity = round(body.counted - stock);
    if (quantity === 0) {
      throw new BadRequestException(
        'El stock contado es igual al de la app; no hay nada que ajustar',
      );
    }
    await this.prisma.stockMovement.create({
      data: {
        productId: id,
        greenhouseId: body.greenhouseId,
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
   * Checks the products of an application in `greenhouseId` (its lot's) and
   * works out what each one takes from that greenhouse's stock. `allowed` are
   * products already on the log, kept even if they were deactivated since. No
   * movement when there is no dose, or when the log is dated before the
   * product's start in that greenhouse (that use is already in its count).
   */
  async applicationRows(
    inputs: AppliedProductInput[],
    date: string,
    greenhouseId: string,
    allowed: ReadonlySet<string> = new Set(),
  ): Promise<AppliedProductRow[]> {
    if (!inputs.length) return [];
    const ids = [...new Set(inputs.map((input) => input.productId))];
    const [products, starts] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, unit: true, active: true },
      }),
      this.startDates(ids, greenhouseId),
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
      const takesStock =
        input.dose !== null &&
        input.doseUnit !== null &&
        usesStock(date, starts.get(stockKey(product.id, greenhouseId)));
      return {
        productId: product.id,
        product: product.name,
        dose: input.dose,
        doseUnit: input.doseUnit,
        method: input.method,
        movement: takesStock
          ? { quantity: -convert(input.dose!, input.doseUnit!, product.unit) }
          : null,
      };
    });
  }

  private greenhouses(): Promise<GreenhouseRef[]> {
    return this.prisma.greenhouse.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  private async figures(ids: string[]): Promise<StockFigures> {
    const [stock, minimums, starts] = await Promise.all([
      this.stockByKey(ids),
      this.prisma.productGreenhouse.findMany({
        where: { productId: { in: ids } },
      }),
      this.startDates(ids),
    ]);
    return {
      stock,
      minimums: new Map(
        minimums.map((m) => [
          stockKey(m.productId, m.greenhouseId),
          m.minStock,
        ]),
      ),
      starts,
    };
  }

  /** Stock per product and greenhouse (only `greenhouseId` when given). */
  private async stockByKey(
    ids: string[],
    greenhouseId?: string,
  ): Promise<Map<string, number>> {
    const sums = await this.prisma.stockMovement.groupBy({
      by: ['productId', 'greenhouseId'],
      where: { productId: { in: ids }, greenhouseId },
      _sum: { quantity: true },
    });
    return new Map(
      sums.map((sum) => [
        stockKey(sum.productId, sum.greenhouseId),
        round(sum._sum.quantity ?? 0),
      ]),
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

  /**
   * First day of each product in each greenhouse: its earliest movement that
   * is not an application (the initial count, an entry or an adjustment).
   */
  private async startDates(
    ids: string[],
    greenhouseId?: string,
  ): Promise<Map<string, string>> {
    const firsts = await this.prisma.stockMovement.groupBy({
      by: ['productId', 'greenhouseId'],
      where: {
        productId: { in: ids },
        greenhouseId,
        type: { not: StockMovementType.APPLICATION },
      },
      _min: { date: true },
    });
    return new Map(
      firsts.map((m) => [
        stockKey(m.productId, m.greenhouseId),
        fromDbDate(m._min.date!),
      ]),
    );
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

  private async assertGreenhouses(ids: string[]): Promise<void> {
    if (!ids.length) return;
    const found = await this.prisma.greenhouse.count({
      where: { id: { in: ids } },
    });
    if (found !== new Set(ids).size) {
      throw new NotFoundException('El invernadero no existe');
    }
  }

  /** Entries and adjustments go between the product's start in that greenhouse and today. */
  private async assertMovementDate(
    id: string,
    greenhouseId: string,
    date: string,
  ): Promise<void> {
    await this.assertProduct(id);
    await this.assertGreenhouses([greenhouseId]);
    this.assertNotFuture(date);
    const start = (await this.startDates([id], greenhouseId)).get(
      stockKey(id, greenhouseId),
    );
    if (start && date < start) {
      throw new BadRequestException(
        `La fecha es anterior al inicio del producto en este invernadero (${start})`,
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

export function stockKey(productId: string, greenhouseId: string): string {
  return `${productId}:${greenhouseId}`;
}

/**
 * Whether an application on `date` takes stock: only on or after the
 * product's start in that greenhouse. Before it (or with no start yet) the use
 * is already in the count, or there is no stock to take from.
 */
export function usesStock(date: string, start: string | undefined): boolean {
  return start !== undefined && date >= start;
}

/** A product's stock in every greenhouse, with 0 where it has no movements. */
export function greenhouseStocks(
  productId: string,
  greenhouses: GreenhouseRef[],
  { stock, minimums, starts }: StockFigures,
): GreenhouseStock[] {
  return greenhouses.map((greenhouse) => {
    const key = stockKey(productId, greenhouse.id);
    const amount = stock.get(key) ?? 0;
    const minStock = minimums.get(key) ?? 0;
    return {
      greenhouse,
      stock: amount,
      minStock,
      status: stockStatus(amount, minStock),
      startDate: starts.get(key) ?? null,
    };
  });
}

export function stockStatus(stock: number, minStock: number): StockStatus {
  if (stock <= 0) return 'OUT';
  if (stock < minStock) return 'LOW';
  return 'OK';
}

/**
 * Weighted by quantity, across all greenhouses (prices are global). Entries
 * with no quantity (an initial count of 0) still count, as a plain average, so
 * the product always has a price.
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

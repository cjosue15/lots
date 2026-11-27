import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { uuidParam } from '../common/schemas.js';
import {
  type CostReport,
  type CycleCost,
  CostsService,
} from './costs.service.js';
import {
  type CatalogQuery,
  catalogQuerySchema,
  type CostQuery,
  costQuerySchema,
  type CreateCategory,
  createCategorySchema,
  type CreateProduct,
  createProductSchema,
  type StockAdjustment,
  stockAdjustmentSchema,
  type StockEntry,
  stockEntrySchema,
  type UpdateCategory,
  updateCategorySchema,
  type UpdateProduct,
  updateProductSchema,
} from './products.schemas.js';
import {
  type AdminProducts,
  type CatalogProduct,
  type ProductDetail,
  ProductsService,
} from './products.service.js';

/** The catalog for the application form (any signed-in user; no prices). */
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  /** Stock is the one in the greenhouse of `lotId`. */
  @Get()
  catalog(
    @Query({ schema: catalogQuerySchema }) query: CatalogQuery,
  ): Promise<CatalogProduct[]> {
    return this.products.catalog(query.lotId);
  }
}

/**
 * Catalog, stock entries and adjustments: admin and engineers (PLAN §14).
 * Engineers enter the price of each entry (from the invoice) but never see
 * prices or averages afterwards; costs stay admin only.
 */
@Roles('admin', 'employee')
@Controller('admin')
export class AdminProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly costs: CostsService,
  ) {}

  /** What applications cost per cycle and per product (PLAN §14, "Costo"). */
  @Roles('admin')
  @Get('costs')
  costReport(
    @Query({ schema: costQuerySchema }) query: CostQuery,
  ): Promise<CostReport> {
    return this.costs.report(query.from, query.to);
  }

  @Roles('admin')
  @Get('cycles/:id/costs')
  cycleCosts(
    @Param('id', { schema: uuidParam }) id: string,
  ): Promise<CycleCost> {
    return this.costs.cycle(id);
  }

  @Get('products')
  async list(@CurrentUser() user: AuthUser): Promise<AdminProducts> {
    return forRole(await this.products.adminList(), user);
  }

  @Post('products')
  async create(
    @Body({ schema: createProductSchema }) body: CreateProduct,
    @CurrentUser() user: AuthUser,
  ): Promise<ProductDetail> {
    return detailForRole(await this.products.create(body), user);
  }

  @Get('products/:id')
  async detail(
    @Param('id', { schema: uuidParam }) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ProductDetail> {
    return detailForRole(await this.products.detail(id), user);
  }

  @Patch('products/:id')
  async update(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: updateProductSchema }) body: UpdateProduct,
    @CurrentUser() user: AuthUser,
  ): Promise<ProductDetail> {
    return detailForRole(await this.products.update(id, body), user);
  }

  @Post('products/:id/entries')
  async addEntry(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: stockEntrySchema }) body: StockEntry,
    @CurrentUser() user: AuthUser,
  ): Promise<ProductDetail> {
    return detailForRole(await this.products.addEntry(id, body, user.id), user);
  }

  @Post('products/:id/adjustments')
  async adjust(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: stockAdjustmentSchema }) body: StockAdjustment,
    @CurrentUser() user: AuthUser,
  ): Promise<ProductDetail> {
    return detailForRole(await this.products.adjust(id, body, user.id), user);
  }

  @Post('product-categories')
  async createCategory(
    @Body({ schema: createCategorySchema }) body: CreateCategory,
    @CurrentUser() user: AuthUser,
  ): Promise<AdminProducts> {
    return forRole(await this.products.createCategory(body), user);
  }

  @Patch('product-categories/:id')
  async updateCategory(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: updateCategorySchema }) body: UpdateCategory,
    @CurrentUser() user: AuthUser,
  ): Promise<AdminProducts> {
    return forRole(await this.products.updateCategory(id, body), user);
  }
}

/** Engineers never see prices (PLAN §14): the admin gets everything. */
export function forRole(list: AdminProducts, user: AuthUser): AdminProducts {
  if (user.role === 'admin') return list;
  return {
    ...list,
    products: list.products.map((p) => ({ ...p, averageCost: null })),
  };
}

export function detailForRole(
  detail: ProductDetail,
  user: AuthUser,
): ProductDetail {
  if (user.role === 'admin') return detail;
  return {
    ...detail,
    averageCost: null,
    movements: detail.movements.map((m) => ({ ...m, unitCost: null })),
  };
}

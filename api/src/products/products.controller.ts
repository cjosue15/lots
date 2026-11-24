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

  @Get()
  catalog(): Promise<CatalogProduct[]> {
    return this.products.catalog();
  }
}

/** Catalog, stock entries and adjustments: admin only (PLAN §14). */
@Roles('admin')
@Controller('admin')
export class AdminProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly costs: CostsService,
  ) {}

  /** What applications cost per cycle and per product (PLAN §14, "Costo"). */
  @Get('costs')
  costReport(
    @Query({ schema: costQuerySchema }) query: CostQuery,
  ): Promise<CostReport> {
    return this.costs.report(query.from, query.to);
  }

  @Get('cycles/:id/costs')
  cycleCosts(
    @Param('id', { schema: uuidParam }) id: string,
  ): Promise<CycleCost> {
    return this.costs.cycle(id);
  }

  @Get('products')
  list(): Promise<AdminProducts> {
    return this.products.adminList();
  }

  @Post('products')
  create(
    @Body({ schema: createProductSchema }) body: CreateProduct,
    @CurrentUser() user: AuthUser,
  ): Promise<ProductDetail> {
    return this.products.create(body, user.id);
  }

  @Get('products/:id')
  detail(
    @Param('id', { schema: uuidParam }) id: string,
  ): Promise<ProductDetail> {
    return this.products.detail(id);
  }

  @Patch('products/:id')
  update(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: updateProductSchema }) body: UpdateProduct,
  ): Promise<ProductDetail> {
    return this.products.update(id, body);
  }

  @Post('products/:id/entries')
  addEntry(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: stockEntrySchema }) body: StockEntry,
    @CurrentUser() user: AuthUser,
  ): Promise<ProductDetail> {
    return this.products.addEntry(id, body, user.id);
  }

  @Post('products/:id/adjustments')
  adjust(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: stockAdjustmentSchema }) body: StockAdjustment,
    @CurrentUser() user: AuthUser,
  ): Promise<ProductDetail> {
    return this.products.adjust(id, body, user.id);
  }

  @Post('product-categories')
  createCategory(
    @Body({ schema: createCategorySchema }) body: CreateCategory,
  ): Promise<AdminProducts> {
    return this.products.createCategory(body);
  }

  @Patch('product-categories/:id')
  updateCategory(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: updateCategorySchema }) body: UpdateCategory,
  ): Promise<AdminProducts> {
    return this.products.updateCategory(id, body);
  }
}

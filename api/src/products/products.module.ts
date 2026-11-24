import { Module } from '@nestjs/common';
import {
  AdminProductsController,
  ProductsController,
} from './products.controller.js';
import { CostsService } from './costs.service.js';
import { ProductsService } from './products.service.js';

@Module({
  controllers: [ProductsController, AdminProductsController],
  providers: [ProductsService, CostsService],
  exports: [ProductsService],
})
export class ProductsModule {}

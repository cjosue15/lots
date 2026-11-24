import { Module } from '@nestjs/common';
import { ActionLogsController } from './action-logs.controller.js';
import { ActionLogsService } from './action-logs.service.js';
import { ProductsModule } from '../products/products.module.js';

@Module({
  imports: [ProductsModule],
  controllers: [ActionLogsController],
  providers: [ActionLogsService],
})
export class ActionLogsModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ActionLogsModule } from './action-logs/action-logs.module.js';
import { AdminModule } from './admin/admin.module.js';
import { ActionsModule } from './actions/actions.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { LotsModule } from './lots/lots.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProductsModule } from './products/products.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    ActionsModule,
    LotsModule,
    ActionLogsModule,
    AdminModule,
    ProductsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

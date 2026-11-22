import { Module } from '@nestjs/common';
import { CyclesController } from './cycles.controller.js';
import { LotsController } from './lots.controller.js';
import { LotsService } from './lots.service.js';

@Module({
  controllers: [LotsController, CyclesController],
  providers: [LotsService],
})
export class LotsModule {}

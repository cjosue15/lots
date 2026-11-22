import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { daySchema, uuidParam } from '../common/schemas.js';
import { type LotDetail, LotsService, type LotSummary } from './lots.service.js';

const startCycleSchema = z.object({ startDate: daySchema.optional() });

@Controller('lots')
export class LotsController {
  constructor(private readonly lots: LotsService) {}

  @Get()
  findAll(): Promise<LotSummary[]> {
    return this.lots.findAll();
  }

  @Get(':id')
  findOne(
    @Param('id', { schema: uuidParam }) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<LotDetail> {
    return this.lots.findOne(id, user);
  }

  /** "Nuevo ciclo": closes the active cycle and opens the next one. */
  @Post(':id/cycles')
  startCycle(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: startCycleSchema }) body: z.infer<typeof startCycleSchema>,
    @CurrentUser() user: AuthUser,
  ): Promise<LotDetail> {
    return this.lots.startCycle(id, body.startDate, user);
  }
}

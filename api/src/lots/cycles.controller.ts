import { Controller, Get, Param } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { uuidParam } from '../common/schemas.js';
import { type CycleDetail, LotsService } from './lots.service.js';

@Controller('cycles')
export class CyclesController {
  constructor(private readonly lots: LotsService) {}

  /** A cycle with all its logs, for the lot's cycle history. */
  @Get(':id')
  findOne(
    @Param('id', { schema: uuidParam }) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<CycleDetail> {
    return this.lots.findCycle(id, user);
  }
}

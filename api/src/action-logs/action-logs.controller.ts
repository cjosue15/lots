import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { uuidParam } from '../common/schemas.js';
import type { ActionLogDetailResponse, ActionLogResponse } from './action-log.response.js';
import {
  type CreateActionLog,
  createActionLogSchema,
  type UpdateActionLog,
  updateActionLogSchema,
  type VoidActionLog,
  voidActionLogSchema,
} from './action-logs.schemas.js';
import { ActionLogsService } from './action-logs.service.js';

@Controller()
export class ActionLogsController {
  constructor(private readonly logs: ActionLogsService) {}

  @Post('cycles/:cycleId/logs')
  create(
    @Param('cycleId', { schema: uuidParam }) cycleId: string,
    @Body({ schema: createActionLogSchema }) body: CreateActionLog,
    @CurrentUser() user: AuthUser,
  ): Promise<ActionLogResponse> {
    return this.logs.create(cycleId, body, user);
  }

  @Get('logs/:id')
  findOne(
    @Param('id', { schema: uuidParam }) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ActionLogDetailResponse> {
    return this.logs.findOne(id, user);
  }

  @Patch('logs/:id')
  update(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: updateActionLogSchema }) body: UpdateActionLog,
    @CurrentUser() user: AuthUser,
  ): Promise<ActionLogResponse> {
    return this.logs.update(id, body, user);
  }

  /** Voids the log instead of deleting it (PLAN §9). */
  @Post('logs/:id/void')
  void(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: voidActionLogSchema }) body: VoidActionLog,
    @CurrentUser() user: AuthUser,
  ): Promise<ActionLogResponse> {
    return this.logs.void(id, body.reason, user);
  }
}

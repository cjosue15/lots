import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { uuidParam } from '../common/schemas.js';
import {
  type CreateAction,
  createActionSchema,
  type CreateLot,
  createLotSchema,
  type MoveAction,
  moveActionSchema,
  type RenamePhase,
  renamePhaseSchema,
  type UpdateAction,
  updateActionSchema,
  type UpdateLot,
  updateLotSchema,
} from './admin.schemas.js';
import { type AdminGreenhouse, AdminService, type AdminTemplate } from './admin.service.js';

/** Every mutation returns the whole updated list, so the screen just replaces it. */
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('template')
  template(): Promise<AdminTemplate> {
    return this.admin.template();
  }

  @Patch('phases/:id')
  renamePhase(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: renamePhaseSchema }) body: RenamePhase,
  ): Promise<AdminTemplate> {
    return this.admin.renamePhase(id, body.name);
  }

  @Post('actions')
  createAction(@Body({ schema: createActionSchema }) body: CreateAction): Promise<AdminTemplate> {
    return this.admin.createAction(body);
  }

  @Patch('actions/:id')
  updateAction(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: updateActionSchema }) body: UpdateAction,
  ): Promise<AdminTemplate> {
    return this.admin.updateAction(id, body);
  }

  @Post('actions/:id/move')
  moveAction(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: moveActionSchema }) body: MoveAction,
  ): Promise<AdminTemplate> {
    return this.admin.moveAction(id, body);
  }

  @Get('lots')
  lots(): Promise<AdminGreenhouse[]> {
    return this.admin.lots();
  }

  @Post('lots')
  createLot(@Body({ schema: createLotSchema }) body: CreateLot): Promise<AdminGreenhouse[]> {
    return this.admin.createLot(body);
  }

  @Patch('lots/:id')
  updateLot(
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: updateLotSchema }) body: UpdateLot,
  ): Promise<AdminGreenhouse[]> {
    return this.admin.updateLot(id, body);
  }
}

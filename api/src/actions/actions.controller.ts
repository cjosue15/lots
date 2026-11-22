import { Controller, Get } from '@nestjs/common';
import { ActionsService, type ActionTemplate } from './actions.service.js';

@Controller('actions')
export class ActionsController {
  constructor(private readonly actions: ActionsService) {}

  /** The template for the "Registrar acción" form. */
  @Get()
  template(): Promise<ActionTemplate> {
    return this.actions.template();
  }
}

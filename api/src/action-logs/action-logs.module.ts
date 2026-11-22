import { Module } from '@nestjs/common';
import { ActionLogsController } from './action-logs.controller.js';
import { ActionLogsService } from './action-logs.service.js';

@Module({
  controllers: [ActionLogsController],
  providers: [ActionLogsService],
})
export class ActionLogsModule {}

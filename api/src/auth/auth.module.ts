import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApplicationAccessService } from './application-access.service.js';
import { AuthController } from './auth.controller.js';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard.js';

/**
 * Protects the whole API: every route needs a valid Supabase token and a
 * `lotes` membership. Use `@Public()` to open a route and `@Roles()` to
 * restrict one.
 */
@Module({
  controllers: [AuthController],
  providers: [
    ApplicationAccessService,
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
  ],
})
export class AuthModule {}

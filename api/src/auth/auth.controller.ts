import { Controller, Get } from '@nestjs/common';
import type { AuthUser } from './auth-user.js';
import { CurrentUser } from './decorators/current-user.decorator.js';

@Controller()
export class AuthController {
  /** The frontend calls it once per token to learn the user's name and role. */
  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}

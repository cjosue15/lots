import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth-user.js';

/** `@CurrentUser()` returns the whole AuthUser, `@CurrentUser('id')` one property. */
export const CurrentUser = createParamDecorator(
  (property: keyof AuthUser | undefined, context: ExecutionContext) => {
    const user = context.switchToHttp().getRequest<Request>().authUser;
    if (!user) {
      throw new UnauthorizedException(
        'Unauthorized: missing or invalid Authorization header',
      );
    }
    return property ? user[property] : user;
  },
);

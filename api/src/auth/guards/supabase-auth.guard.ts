import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { SupabaseEnv } from '@supabase/server';
import { verifyCredentials } from '@supabase/server/core';
import type { Request } from 'express';
import { ApplicationAccessService } from '../application-access.service.js';
import type { AppRole } from '../auth-user.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

/**
 * Global guard (APP_GUARD):
 * 1. Verifies the Supabase JWT offline against the project's JWKS (signature
 *    and expiry; `jose` caches the keys).
 * 2. Resolves role + local user, cached per token ({@link ApplicationAccessService}).
 * 3. Enforces `@Roles()` when present.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);
  private readonly env: Partial<SupabaseEnv>;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService,
    private readonly applicationAccess: ApplicationAccessService,
  ) {
    this.env = {
      url: config.getOrThrow<string>('SUPABASE_URL'),
      jwks: new URL(config.getOrThrow<string>('SUPABASE_JWKS_URL')),
    };
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException(
        'Unauthorized: missing or invalid Authorization header',
      );
    }

    const { data: auth, error } = await verifyCredentials(
      { token, apikey: null },
      { auth: 'user', env: this.env },
    );

    if (error) {
      // A 5xx here can only come from our own configuration.
      if (error.status >= 500) {
        this.logger.error(
          `Invalid Supabase configuration [${error.code}]: ${error.message}`,
        );
        throw new InternalServerErrorException(
          'Authentication is temporarily unavailable',
        );
      }
      throw new UnauthorizedException(
        'Unauthorized: invalid or expired access token',
      );
    }

    if (!auth.userClaims?.id) {
      throw new UnauthorizedException('Unauthorized: missing user identity');
    }

    const user = await this.applicationAccess.resolveUser(
      token,
      auth.userClaims,
      auth.jwtClaims?.exp,
    );

    const roles = this.reflector.getAllAndOverride<AppRole[] | undefined>(
      ROLES_KEY,
      targets,
    );
    if (roles?.length && !roles.includes(user.role)) {
      throw new ForbiddenException('No tienes permiso para realizar esta acción');
    }

    request.authUser = user;
    return true;
  }

  private extractBearerToken(request: Request): string | null {
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    return scheme?.toLowerCase() === 'bearer' && token ? token : null;
  }
}

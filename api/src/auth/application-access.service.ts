import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { UserClaims } from '@supabase/server';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { APP_ROLES, type AppRole, type AuthUser } from './auth-user.js';

export const APPLICATION_ID = 'lotes';

interface CacheEntry {
  user: AuthUser;
  /** JWT `exp` in milliseconds. */
  expiresAt: number;
}

/**
 * Resolves the role (from `application_memberships`) and the local `User`
 * row **once per token**:
 *
 * - The result lives in memory until the JWT expires, so a screen that makes
 *   several API calls only queries Supabase once. When the token is renewed
 *   (≈ every hour) the role is checked again, like the frontend does.
 * - Simultaneous requests with the same token share one lookup.
 * - Only granted access is cached: a 403 or a Supabase failure (503) is
 *   retried on the next request.
 *
 * The query uses the user's own JWT and the publishable key, so RLS
 * (`memberships_read_own`) applies and the backend needs no secret key.
 */
@Injectable()
export class ApplicationAccessService {
  private readonly url: URL;
  private readonly publishableKey: string;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<AuthUser>>();

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.url = new URL(
      '/rest/v1/application_memberships',
      config.getOrThrow<string>('SUPABASE_URL'),
    );
    this.publishableKey = config.getOrThrow<string>('SUPABASE_PUBLISHABLE_KEY');
  }

  async resolveUser(
    token: string,
    claims: UserClaims,
    exp: number | undefined,
  ): Promise<AuthUser> {
    const key = createHash('sha256').update(token).digest('hex');
    const now = Date.now();

    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.user;
    }

    let pending = this.inFlight.get(key);
    if (!pending) {
      pending = this.lookup(token, claims).finally(() =>
        this.inFlight.delete(key),
      );
      this.inFlight.set(key, pending);
    }

    const user = await pending;
    this.sweep(now);
    if (exp) {
      this.cache.set(key, { user, expiresAt: exp * 1000 });
    }
    return user;
  }

  private async lookup(token: string, claims: UserClaims): Promise<AuthUser> {
    const role = await this.fetchRole(token, claims.id);
    const email = claims.email ?? '';
    const displayName = this.displayName(claims);
    const local = await this.upsertUser(claims.id, email, displayName);

    return {
      id: local.id,
      authId: claims.id,
      email: local.email,
      displayName: local.displayName,
      role,
    };
  }

  private async fetchRole(token: string, userId: string): Promise<AppRole> {
    const url = new URL(this.url);
    url.search = new URLSearchParams({
      select: 'user_id,role',
      application_id: `eq.${APPLICATION_ID}`,
      user_id: `eq.${userId}`,
      limit: '1',
    }).toString();

    let rows: unknown;
    try {
      const response = await fetch(url, {
        headers: {
          apikey: this.publishableKey,
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        throw new Error('Membership lookup failed');
      }
      rows = await response.json();
      if (!Array.isArray(rows)) {
        throw new Error('Invalid membership response');
      }
    } catch {
      throw new ServiceUnavailableException(
        'Application access verification is temporarily unavailable',
      );
    }

    const row: unknown = rows.find(
      (item: unknown) =>
        typeof item === 'object' &&
        item !== null &&
        'user_id' in item &&
        item.user_id === userId,
    );
    if (!row) {
      throw new ForbiddenException('No tienes acceso a esta aplicación');
    }

    const role = (row as { role?: unknown }).role;
    if (!APP_ROLES.includes(role as AppRole)) {
      throw new ServiceUnavailableException(
        'Application access verification is temporarily unavailable',
      );
    }
    return role as AppRole;
  }

  /** Creates the local row on first login and keeps email/name in sync. */
  private async upsertUser(authId: string, email: string, displayName: string) {
    try {
      return await this.prisma.user.upsert({
        where: { authId },
        update: { email, displayName },
        create: { authId, email, displayName },
      });
    } catch {
      // Two first requests with different tokens can race on the unique authId.
      return this.prisma.user.findUniqueOrThrow({ where: { authId } });
    }
  }

  private displayName(claims: UserClaims): string {
    const metadata = claims.userMetadata ?? {};
    for (const field of ['full_name', 'name', 'display_name']) {
      const value = metadata[field];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return claims.email?.split('@')[0] ?? 'Usuario';
  }

  private sweep(now: number) {
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }
}

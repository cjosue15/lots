import type { AuthUser } from '../auth-user.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by `SupabaseAuthGuard`; undefined on `@Public()` routes. */
      authUser?: AuthUser;
    }
  }
}

export {};

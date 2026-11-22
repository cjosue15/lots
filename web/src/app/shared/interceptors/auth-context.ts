import { HttpContextToken } from '@angular/common/http';

/** Set on requests whose 401/403/503 the caller handles itself (e.g. `GET /me`). */
export const SKIP_AUTH_ERRORS = new HttpContextToken<boolean>(() => false);

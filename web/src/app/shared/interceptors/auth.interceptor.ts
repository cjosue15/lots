import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { toast } from '@spartan-ng/brain/sonner';
import { catchError, from, map, of, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../modules/auth/services/auth.service';
import { supabase } from '../supabase';
import { SKIP_AUTH_ERRORS } from './auth-context';

const NO_APP_ACCESS = 'No tienes acceso a esta aplicación';

/**
 * Adds the Supabase access token to API requests only, and reacts to auth
 * errors: 401 → sign out; 403 without membership → sign out; 403 by role →
 * message only; 503 → message, the session is kept.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }

  const auth = inject(AuthService);
  const router = inject(Router);

  // getSession() returns a fresh token (supabase-js renews it before expiry).
  const request$ = req.headers.has('Authorization')
    ? of(req)
    : from(supabase.auth.getSession()).pipe(
        map(({ data }) =>
          data.session
            ? req.clone({ setHeaders: { Authorization: `Bearer ${data.session.access_token}` } })
            : req,
        ),
      );

  return request$.pipe(
    switchMap((request) => next(request)),
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && !req.context.get(SKIP_AUTH_ERRORS)) {
        handleAuthError(error, auth, router);
      }
      return throwError(() => error);
    }),
  );
};

function handleAuthError(error: HttpErrorResponse, auth: AuthService, router: Router): void {
  const message: unknown = error.error?.message;
  const endSession = (text: string, id: string) => {
    // A fixed id keeps parallel failing requests from stacking toasts.
    toast.error(text, { id });
    void auth.signOut().then(() => router.navigateByUrl('/login'));
  };

  if (error.status === 401) {
    endSession('Tu sesión terminó. Ingresa de nuevo.', 'session-ended');
  } else if (error.status === 403 && message === NO_APP_ACCESS) {
    endSession(`${NO_APP_ACCESS}.`, 'no-app-access');
  } else if (error.status === 403) {
    toast.error(typeof message === 'string' ? message : 'No tienes permiso para esta acción.');
  } else if (error.status === 503) {
    toast.error('No se pudo verificar tu acceso. Inténtalo de nuevo en unos momentos.', {
      id: 'access-check-failed',
    });
  }
}

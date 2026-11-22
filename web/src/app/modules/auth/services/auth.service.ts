import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Service, signal } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { SKIP_AUTH_ERRORS } from '../../../shared/interceptors/auth-context';
import { supabase } from '../../../shared/supabase';
import type { Me } from '../models/me.model';

/** The account exists but has no `lotes` membership (403). */
export class AccessDeniedError extends Error {}
/** The API or Supabase could not be reached (network, 5xx). */
export class AccessCheckError extends Error {}

const ACCESS_DENIED = 'No tienes acceso a esta aplicación. Pide acceso al administrador.';
const ACCESS_CHECK_FAILED = 'No se pudo verificar tu acceso. Inténtalo de nuevo en unos momentos.';

@Service()
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly _session = signal<Session | null>(null);
  private readonly _me = signal<Me | null>(null);
  /** One `GET /me` per token, shared by the initializer, guards and login. */
  private meRequest: { token: string; promise: Promise<Me | null> } | null = null;

  readonly me = this._me.asReadonly();
  readonly isAuthenticated = computed(() => this._me() !== null);
  readonly isAdmin = computed(() => this._me()?.role === 'admin');

  constructor() {
    // Keep the callback synchronous so it never blocks Supabase Auth.
    supabase.auth.onAuthStateChange((_event, session) => this.updateSession(session));
  }

  async initialize(): Promise<void> {
    const { data } = await supabase.auth.getSession();
    this.updateSession(data.session);
    try {
      await this.loadMe();
    } catch {
      // The guard sends the user to the login screen.
    }
  }

  /**
   * Resolves the current user via `GET /me`, once per token. A new token
   * (Supabase renews it ≈ every hour) triggers a new check on the next call.
   * Resolves `null` without a valid session; failures are not cached.
   */
  loadMe(): Promise<Me | null> {
    const session = this._session();
    if (!session) {
      return Promise.resolve(null);
    }
    if (this.meRequest?.token === session.access_token) {
      return this.meRequest.promise;
    }

    const token = session.access_token;
    const promise = this.fetchMe(token);
    this.meRequest = { token, promise };
    return promise;
  }

  async signIn(email: string, password: string): Promise<void> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw new Error(
        error.code === 'invalid_credentials'
          ? 'Correo o contraseña incorrectos.'
          : 'No se pudo iniciar sesión. Revisa tu conexión e inténtalo de nuevo.',
      );
    }

    this.updateSession(data.session);
    try {
      if (!(await this.loadMe())) {
        throw new AccessCheckError(ACCESS_CHECK_FAILED);
      }
    } catch (error) {
      await this.signOut();
      throw error;
    }
  }

  async signOut(): Promise<void> {
    this.meRequest = null;
    this._me.set(null);
    this._session.set(null);
    await supabase.auth.signOut({ scope: 'local' });
  }

  private async fetchMe(token: string): Promise<Me | null> {
    try {
      const me = await firstValueFrom(
        this.http.get<Me>(`${environment.apiUrl}/me`, {
          headers: { Authorization: `Bearer ${token}` },
          context: new HttpContext().set(SKIP_AUTH_ERRORS, true),
        }),
      );
      // A slower response for an older token must not overwrite a newer one.
      if (this.meRequest?.token === token) {
        this._me.set(me);
      }
      return me;
    } catch (error) {
      if (this.meRequest?.token === token) {
        this.meRequest = null;
        this._me.set(null);
      }
      if (error instanceof HttpErrorResponse && error.status === 401) {
        return null;
      }
      if (error instanceof HttpErrorResponse && error.status === 403) {
        throw new AccessDeniedError(ACCESS_DENIED);
      }
      throw new AccessCheckError(ACCESS_CHECK_FAILED);
    }
  }

  private updateSession(session: Session | null): void {
    const previous = this._session();
    if (previous?.access_token !== session?.access_token) {
      this.meRequest = null;
    }
    // Keep the name and role on screen while a renewed token is re-checked;
    // clear them if the user changed or signed out.
    if (previous?.user.id !== session?.user.id) {
      this._me.set(null);
    }
    this._session.set(session);
  }
}

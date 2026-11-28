import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { AuthService } from '../../services/auth.service';

/**
 * Shown when the app opens but the access check fails for a temporary reason.
 * The session is kept, so retrying goes straight back to where the user was.
 */
@Component({
  selector: 'app-access-check-failed',
  imports: [NgOptimizedImage, HlmButtonImports, HlmCardImports, HlmSpinnerImports],
  template: `
    <main class="flex min-h-dvh items-center justify-center px-4 py-10">
      <section hlmCard class="w-full max-w-[400px] shadow-sm">
        <div hlmCardHeader>
          <p class="mb-3 flex items-center gap-2 font-semibold">
            <img ngSrc="logo.png" width="472" height="285" alt="" priority class="h-10 w-auto" />
            Oro Verde
          </p>
          <h1 hlmCardTitle>No se pudo verificar tu acceso</h1>
          <p hlmCardDescription>
            El servidor no respondió. Tu sesión sigue abierta: revisa tu conexión y vuelve a
            intentarlo.
          </p>
        </div>
        <div hlmCardFooter class="flex flex-col gap-2">
          <button hlmBtn class="h-11 w-full" [disabled]="retrying()" (click)="retry()">
            @if (retrying()) {
              <hlm-spinner class="size-4" aria-hidden="true" />
            }
            Reintentar
          </button>
          <button hlmBtn variant="ghost" class="w-full" [disabled]="retrying()" (click)="signOut()">
            Cerrar sesión
          </button>
        </div>
      </section>
    </main>
  `,
})
export class AccessCheckFailedComponent {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  /** Where the user was going (`?volver=`). */
  readonly volver = input<string>();

  protected readonly retrying = signal(false);
  /** Only app paths, never an outside URL. */
  private readonly target = computed(() => {
    const url = this.volver();
    return url?.startsWith('/') && !url.startsWith('//') && !url.startsWith('/sin-conexion')
      ? url
      : '/';
  });

  protected async retry(): Promise<void> {
    this.retrying.set(true);
    try {
      await this.router.navigateByUrl(this.target());
    } finally {
      this.retrying.set(false);
    }
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}

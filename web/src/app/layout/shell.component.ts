import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLogOut } from '@ng-icons/lucide';
import { ROLE_LABELS } from '../modules/auth/models/me.model';
import { AuthService } from '../modules/auth/services/auth.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, NgIcon],
  providers: [provideIcons({ lucideLogOut })],
  template: `
    <header class="bg-primary text-primary-foreground">
      <div class="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
        <a
          routerLink="/"
          class="flex items-center gap-2 rounded-sm font-semibold focus-visible:ring-3 focus-visible:ring-white/60 focus-visible:outline-none"
        >
          <span aria-hidden="true" class="size-2.5 rounded-full bg-(--gold)"></span>
          Oro Verde
        </a>

        @if (auth.me(); as me) {
          <p class="ml-auto min-w-0 text-right text-sm leading-tight">
            <span class="block truncate">{{ me.displayName }}</span>
            <span class="block text-xs text-primary-foreground/75">{{ roleLabel() }}</span>
          </p>
        }

        <button
          type="button"
          class="flex h-10 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm hover:bg-white/10 focus-visible:ring-3 focus-visible:ring-white/60 focus-visible:outline-none"
          (click)="signOut()"
        >
          <ng-icon name="lucideLogOut" size="16" aria-hidden="true" />
          Salir
        </button>
      </div>
    </header>

    <main class="mx-auto max-w-5xl px-4 py-6">
      <router-outlet />
    </main>
  `,
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly roleLabel = computed(() => {
    const role = this.auth.me()?.role;
    return role ? ROLE_LABELS[role] : '';
  });

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}

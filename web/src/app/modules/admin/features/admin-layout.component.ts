import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../auth/services/auth.service';

/**
 * Admin area: title plus its sections as tabs (links, so each has its own URL).
 * Engineers only get Productos, under the title "Inventario".
 */
@Component({
  selector: 'app-admin-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="w-full">
      <h1 class="text-2xl font-semibold">{{ isAdmin() ? 'Administración' : 'Inventario' }}</h1>

      @if (tabs().length > 1) {
        <nav
          aria-label="Secciones de administración"
          class="mt-4 inline-flex max-w-full overflow-x-auto rounded-lg bg-muted p-1"
        >
          @for (tab of tabs(); track tab.path) {
            <a
              [routerLink]="tab.path"
              routerLinkActive="bg-card text-foreground shadow-sm"
              ariaCurrentWhenActive="page"
              class="shrink-0 rounded-md px-4 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {{ tab.label }}
            </a>
          }
        </nav>
      }

      <div class="mt-6">
        <router-outlet />
      </div>
    </div>
  `,
})
export class AdminLayoutComponent {
  protected readonly isAdmin = inject(AuthService).isAdmin;
  protected readonly tabs = computed(() =>
    [
      { path: 'template', label: 'Plantilla', adminOnly: true },
      { path: 'lots', label: 'Lotes', adminOnly: true },
      { path: 'products', label: 'Productos', adminOnly: false },
      { path: 'costs', label: 'Costos', adminOnly: true },
      { path: 'map', label: 'Vista 3D', adminOnly: true },
    ].filter((tab) => this.isAdmin() || !tab.adminOnly),
  );
}

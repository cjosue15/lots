import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/** Admin area: title plus its sections as tabs (links, so each has its own URL). */
@Component({
  selector: 'app-admin-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="w-full">
      <h1 class="text-2xl font-semibold">Administración</h1>

      <nav
        aria-label="Secciones de administración"
        class="mt-4 inline-flex rounded-lg bg-muted p-1"
      >
        @for (tab of tabs; track tab.path) {
          <a
            [routerLink]="tab.path"
            routerLinkActive="bg-card text-foreground shadow-sm"
            ariaCurrentWhenActive="page"
            class="rounded-md px-4 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {{ tab.label }}
          </a>
        }
      </nav>

      <div class="mt-6">
        <router-outlet />
      </div>
    </div>
  `,
})
export class AdminLayoutComponent {
  protected readonly tabs = [
    { path: 'template', label: 'Plantilla' },
    { path: 'lots', label: 'Lotes' },
    { path: 'products', label: 'Productos' },
    { path: 'map', label: 'Vista 3D' },
  ];
}

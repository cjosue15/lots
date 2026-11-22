import { Routes } from '@angular/router';

export const adminRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/admin-layout.component').then((m) => m.AdminLayoutComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'template' },
      {
        path: 'template',
        title: 'Plantilla | Oro Verde',
        loadComponent: () =>
          import('./features/template/template-admin.component').then(
            (m) => m.TemplateAdminComponent,
          ),
      },
      {
        path: 'map',
        title: 'Vista 3D | Oro Verde',
        loadComponent: () =>
          import('./features/farm-map/farm-map.component').then((m) => m.FarmMapComponent),
      },
      {
        path: 'lots',
        title: 'Lotes | Administración | Oro Verde',
        loadComponent: () =>
          import('./features/lots/lots-admin.component').then((m) => m.LotsAdminComponent),
      },
    ],
  },
];

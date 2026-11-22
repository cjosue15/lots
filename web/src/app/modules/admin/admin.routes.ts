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
        path: 'lots',
        title: 'Lotes | Administración | Oro Verde',
        loadComponent: () =>
          import('./features/lots/lots-admin.component').then((m) => m.LotsAdminComponent),
      },
    ],
  },
];

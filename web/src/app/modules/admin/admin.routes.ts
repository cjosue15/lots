import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { AuthService } from '../auth/services/auth.service';
import { adminGuard } from '../../shared/guards/admin.guard';

export const adminRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/admin-layout.component').then((m) => m.AdminLayoutComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: () => (inject(AuthService).isAdmin() ? 'template' : 'products'),
      },
      {
        path: 'template',
        canMatch: [adminGuard],
        title: 'Plantilla | Oro Verde',
        loadComponent: () =>
          import('./features/template/template-admin.component').then(
            (m) => m.TemplateAdminComponent,
          ),
      },
      {
        path: 'products',
        title: 'Productos | Administración | Oro Verde',
        loadComponent: () =>
          import('./features/products/products-admin.component').then(
            (m) => m.ProductsAdminComponent,
          ),
      },
      {
        path: 'products/:id',
        title: 'Producto | Administración | Oro Verde',
        loadComponent: () =>
          import('./features/products/product-detail.component').then(
            (m) => m.ProductDetailComponent,
          ),
      },
      {
        path: 'costs',
        canMatch: [adminGuard],
        title: 'Costos | Administración | Oro Verde',
        loadComponent: () =>
          import('./features/costs/costs-admin.component').then((m) => m.CostsAdminComponent),
      },
      {
        path: 'map',
        canMatch: [adminGuard],
        title: 'Vista 3D | Oro Verde',
        loadComponent: () =>
          import('./features/farm-map/farm-map.component').then((m) => m.FarmMapComponent),
      },
      {
        path: 'lots',
        canMatch: [adminGuard],
        title: 'Lotes | Administración | Oro Verde',
        loadComponent: () =>
          import('./features/lots/lots-admin.component').then((m) => m.LotsAdminComponent),
      },
    ],
  },
];

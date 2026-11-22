import { Routes } from '@angular/router';

export const lotsRoutes: Routes = [
  {
    path: '',
    title: 'Lotes | Oro Verde',
    loadComponent: () =>
      import('./features/overview/overview.component').then((m) => m.OverviewComponent),
  },
  {
    path: 'lots/:id',
    title: 'Lote | Oro Verde',
    loadComponent: () =>
      import('./features/lot-detail/lot-detail.component').then((m) => m.LotDetailComponent),
  },
  {
    path: 'lots/:id/log',
    title: 'Registrar acción | Oro Verde',
    loadComponent: () =>
      import('./features/register-log/register-log.component').then(
        (m) => m.RegisterLogComponent,
      ),
  },
  {
    path: 'logs/:logId',
    title: 'Registro | Oro Verde',
    loadComponent: () =>
      import('./features/log-detail/log-detail.component').then((m) => m.LogDetailComponent),
  },
  {
    path: 'logs/:logId/edit',
    title: 'Editar registro | Oro Verde',
    loadComponent: () =>
      import('./features/register-log/register-log.component').then(
        (m) => m.RegisterLogComponent,
      ),
  },
  {
    path: 'cycles/:cycleId',
    title: 'Ciclo | Oro Verde',
    loadComponent: () =>
      import('./features/cycle-detail/cycle-detail.component').then(
        (m) => m.CycleDetailComponent,
      ),
  },
];

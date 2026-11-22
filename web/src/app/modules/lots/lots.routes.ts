import { Routes } from '@angular/router';

export const lotsRoutes: Routes = [
  {
    path: '',
    title: 'Lotes | Oro Verde',
    loadComponent: () =>
      import('./features/overview/overview.component').then((m) => m.OverviewComponent),
  },
];

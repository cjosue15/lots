import { Routes } from '@angular/router';
import { authGuard } from './shared/guards/auth.guard';
import { publicGuard } from './shared/guards/public.guard';

export const routes: Routes = [
  {
    path: 'login',
    canMatch: [publicGuard],
    loadChildren: () => import('./modules/auth/auth.routes').then((m) => m.authRoutes),
  },
  {
    path: '',
    canMatch: [authGuard],
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        path: '',
        loadChildren: () => import('./modules/lots/lots.routes').then((m) => m.lotsRoutes),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];

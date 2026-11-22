import { Routes } from '@angular/router';

export const authRoutes: Routes = [
  {
    path: '',
    title: 'Ingresar | Lotes Oro Verde',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
  },
];

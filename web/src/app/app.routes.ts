import { Routes } from '@angular/router';
import { provideBrnCalendarI18n } from '@spartan-ng/brain/calendar';
import { adminGuard } from './shared/guards/admin.guard';
import { authGuard } from './shared/guards/auth.guard';
import { publicGuard } from './shared/guards/public.guard';
import { calendarI18nEs } from './shared/ui/calendar-i18n';

export const routes: Routes = [
  {
    path: 'login',
    canMatch: [publicGuard],
    loadChildren: () => import('./modules/auth/auth.routes').then((m) => m.authRoutes),
  },
  {
    // The access check failed for a temporary reason; the session is kept.
    path: 'sin-conexion',
    title: 'Sin conexión | Lotes Oro Verde',
    loadComponent: () =>
      import('./modules/auth/features/access-check-failed/access-check-failed.component').then(
        (m) => m.AccessCheckFailedComponent,
      ),
  },
  {
    path: '',
    canMatch: [authGuard],
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    providers: [provideBrnCalendarI18n(calendarI18nEs)],
    children: [
      {
        path: 'admin',
        canMatch: [adminGuard],
        loadChildren: () => import('./modules/admin/admin.routes').then((m) => m.adminRoutes),
      },
      {
        path: '',
        loadChildren: () => import('./modules/lots/lots.routes').then((m) => m.lotsRoutes),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];

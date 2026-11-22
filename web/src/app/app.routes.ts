import { Routes } from '@angular/router';
import { provideBrnCalendarI18n } from '@spartan-ng/brain/calendar';
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
    path: '',
    canMatch: [authGuard],
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    providers: [provideBrnCalendarI18n(calendarI18nEs)],
    children: [
      {
        path: '',
        loadChildren: () => import('./modules/lots/lots.routes').then((m) => m.lotsRoutes),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];

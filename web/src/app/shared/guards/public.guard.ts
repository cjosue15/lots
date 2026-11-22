import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AuthService } from '../../modules/auth/services/auth.service';

/** Keeps signed-in users out of the login screen. */
export const publicGuard: CanMatchFn = () => {
  const auth = inject(AuthService);
  return auth.isAuthenticated() ? inject(Router).parseUrl('/') : true;
};

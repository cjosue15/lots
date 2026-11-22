import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AuthService } from '../../modules/auth/services/auth.service';

/** For the admin screens (stage 6). Runs after authGuard, so `me` is loaded. */
export const adminGuard: CanMatchFn = () => {
  const auth = inject(AuthService);
  return auth.isAdmin() ? true : inject(Router).parseUrl('/');
};

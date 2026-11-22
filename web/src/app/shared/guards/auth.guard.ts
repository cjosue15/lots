import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { toast } from '@spartan-ng/brain/sonner';
import { AuthService } from '../../modules/auth/services/auth.service';

/** Lets in users with a `lotes` membership; everyone else goes to /login. */
export const authGuard: CanMatchFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  try {
    return (await auth.loadMe()) ? true : router.parseUrl('/login');
  } catch (error) {
    await auth.signOut();
    toast.error((error as Error).message);
    return router.parseUrl('/login');
  }
};

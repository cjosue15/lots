import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { toast } from '@spartan-ng/brain/sonner';
import { AccessCheckError, AuthService } from '../../modules/auth/services/auth.service';

/**
 * Lets in users with a `lotes` membership; everyone else goes to /login.
 * A failed check (API restarting, no network, 5xx) keeps the session: a user
 * already verified keeps navigating (the API checks every request anyway),
 * and on the first load the retry screen is shown.
 */
export const authGuard: CanMatchFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  try {
    return (await auth.loadMe()) ? true : router.parseUrl('/login');
  } catch (error) {
    if (error instanceof AccessCheckError) {
      if (auth.me()) {
        toast.error(error.message, { id: 'access-check-failed' });
        return true;
      }
      const target = router.currentNavigation()?.extractedUrl.toString() ?? '/';
      return router.createUrlTree(['/sin-conexion'], { queryParams: { volver: target } });
    }
    // No membership (403): the account can't use the app.
    await auth.signOut();
    toast.error((error as Error).message);
    return router.parseUrl('/login');
  }
};

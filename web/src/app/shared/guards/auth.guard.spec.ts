import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import {
  AccessCheckError,
  AccessDeniedError,
  AuthService,
} from '../../modules/auth/services/auth.service';
import { authGuard } from './auth.guard';

@Component({ template: '' })
class Page {}

describe('authGuard', () => {
  const setup = (loadMe: () => Promise<unknown>, me: unknown = null) => {
    const signOut = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { loadMe, signOut, me: () => me } },
        provideRouter([
          { path: 'login', component: Page },
          { path: 'sin-conexion', component: Page },
          { path: '', canMatch: [authGuard], children: [{ path: 'lots/:id', component: Page }] },
        ]),
      ],
    });
    return { router: TestBed.inject(Router), signOut };
  };

  it('keeps the session and shows the retry screen when the first check fails', async () => {
    const { router, signOut } = setup(() => Promise.reject(new AccessCheckError('x')));
    await router.navigateByUrl('/lots/1');
    expect(router.url).toBe('/sin-conexion?volver=%2Flots%2F1');
    expect(signOut).not.toHaveBeenCalled();
  });

  it('lets an already verified user keep navigating when a later check fails', async () => {
    const { router, signOut } = setup(() => Promise.reject(new AccessCheckError('x')), {
      role: 'admin',
    });
    await router.navigateByUrl('/lots/1');
    expect(router.url).toBe('/lots/1');
    expect(signOut).not.toHaveBeenCalled();
  });

  it('signs out when the account has no access', async () => {
    const { router, signOut } = setup(() => Promise.reject(new AccessDeniedError('x')));
    await router.navigateByUrl('/lots/1');
    expect(router.url).toBe('/login');
    expect(signOut).toHaveBeenCalled();
  });
});

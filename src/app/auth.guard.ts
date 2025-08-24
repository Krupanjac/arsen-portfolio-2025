import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // If we already know session, allow/deny synchronously
  if (auth.authenticated) return true;

  // Otherwise perform a session check (returning a Promise-like observable is not allowed here),
  // so we perform a blocking check by using the session endpoint and awaiting it via toPromise-like pattern is not available.
  // As a simple solution we redirect to login and let the login flow handle post-login navigation.
  router.navigate(['/login']);
  return false;
};

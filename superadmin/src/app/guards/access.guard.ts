import { CanMatchFn, Router, Route } from '@angular/router';
import { inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { filter, map, take } from 'rxjs';
import { AuthState, MeStatus } from '../../state/auth/auth.state';
import { canAccess } from './can-access.guard';
import { defaultRouteFor } from './default-route.guard';
import type { ModuleKey } from '../data/types/access/module-key.type';
import type { Role } from '../data/dtos/auth';

/** Central `canMatch` guard (14-access-control.md §3): every routed module
 *  declares `data: { module, roles }`; blocked modules never match, so their
 *  lazy bundles are never requested. Waits for the boot `/auth/me` to resolve
 *  (the layout splashes meanwhile) — no gating decision runs on absent data. */
export const accessGuard: CanMatchFn = (route: Route) => {
  const store = inject(Store);
  const router = inject(Router);
  const module = route.data?.['module'] as ModuleKey;
  const roles = route.data?.['roles'] as readonly Role[] | undefined;

  // canMatch runs during route recognition, BEFORE the layout's authGuard.
  // With no session there is no /auth/me in flight — let the match succeed
  // so authGuard can bounce to /login instead of waiting forever.
  if (!store.selectSnapshot(AuthState.token)) return true;

  return store.select(AuthState.meStatus).pipe(
    filter((s) => s === MeStatus.Loaded || s === MeStatus.Error),
    take(1),
    map(() => {
      const me = store.selectSnapshot(AuthState.me);
      if (me && canAccess(me, module, roles)) return true;
      return router.parseUrl(defaultRouteFor(me));
    }),
  );
};

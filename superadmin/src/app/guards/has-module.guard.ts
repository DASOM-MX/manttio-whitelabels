import type { MeResponse } from '../data/dtos/auth';
import type { ModuleKey } from '../data/types/access/module-key.type';

/** Module gate — role-only runtime gating (2026-07-15): every module is on
 *  for signed-in users; unbuilt modules show their stub page. Org-level
 *  module flags are the whitelabels admin app's domain (not this repo), and
 *  the segregation mechanism — how an org's flags reach a tenant instance —
 *  is TBD; build no flag plumbing here until it's decided. `module` stays so
 *  call sites keep declaring intent. */
export const hasModule = (me: MeResponse | null, module: ModuleKey): boolean => {
  void module;
  return !!me;
};

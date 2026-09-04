import type { PortalGrant } from '../../app/model/enums/portal-auth/portal-grants.enum';

/** Loads one Inicio card per granted section (04 §8) — the component reads
 *  `AuthState.grants` and passes them along so the state has no reason to
 *  reach into another state's snapshot. */
export class HomeLoadSummaries {
  static readonly type = '[Home] Load Summaries';
  constructor(public grants: PortalGrant[]) {}
}

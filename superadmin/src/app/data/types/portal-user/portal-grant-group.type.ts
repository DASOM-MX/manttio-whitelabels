import type { PortalGrant } from '../../../model/enums/portal-user/portal-grant.enum';

/** One column of the grants editor (26 §3): a titled group of grant ids,
 *  rendered in order. Two groups today — Consultar / Actuar. */
export interface PortalGrantGroup {
  title: string;
  grants: PortalGrant[];
}

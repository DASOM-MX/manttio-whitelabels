import { PortalGrant } from '../../enums/portal-user/portal-grant.enum';
import type { PortalGrantGroup } from '../../../data/types/portal-user/portal-grant-group.type';

/** The grants editor's two columns (26 §3) — one source of truth shared by
 *  the invite dialog (26 CP-2) and the standalone grants editor (26 CP-3).
 *  `cancel_service_requests` sits under Actuar (owner, 2026-09-03): the plan
 *  doc still says "seven grants" — flagged to the owner separately, not
 *  edited here. */
export const PORTAL_GRANT_GROUPS: PortalGrantGroup[] = [
  {
    title: 'Consultar',
    grants: [
      PortalGrant.ViewReports,
      PortalGrant.ViewContracts,
      PortalGrant.ViewQuotations,
      PortalGrant.ViewServiceOrders,
      PortalGrant.ViewEquipment,
    ],
  },
  {
    title: 'Actuar',
    grants: [
      PortalGrant.ApproveQuotations,
      PortalGrant.CreateServiceRequests,
      PortalGrant.CancelServiceRequests,
    ],
  },
];

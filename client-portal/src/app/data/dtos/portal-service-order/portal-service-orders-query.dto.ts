import type { ServiceOrderStatus } from '../../../model/enums/service-order/service-order-status.enum';

/** `GET /portal/service-orders` query (backend
 *  `portalServiceOrdersQuerySchema`, 04 §6). No priority filter — priority is
 *  not exposed at all (A15). No `customerId` — the scope is the token's. */
export interface PortalServiceOrdersQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: ServiceOrderStatus;
}

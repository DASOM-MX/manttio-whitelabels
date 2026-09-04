import type { ServiceOrderStatus } from '../../../model/enums/service-order/service-order-status.enum';

/** A service order row as the customer sees it (backend
 *  `PortalServiceOrderListItem`, 04 §6). `quotationFolio` is nullable — an
 *  order opened without a quotation has none, and it must render cleanly
 *  rather than as a blank chip. No priority field exists on this wire shape
 *  (A15) — it is an internal dispatch signal. */
export interface PortalServiceOrderListItem {
  id: string;
  folio: string;
  status: ServiceOrderStatus;
  /** The customer's own site — not a staff field. */
  location: string | null;
  promisedDate: string | null;
  quotationFolio: string | null;
  reportCount: number;
  createdAt: string;
}

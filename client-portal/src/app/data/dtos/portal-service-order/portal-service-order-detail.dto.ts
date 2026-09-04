import type { PortalLinkedReport } from '../portal-report/portal-linked-report.dto';
import type { PortalServiceOrderLine } from './portal-service-order-line.dto';
import type { PortalServiceOrderListItem } from './portal-service-order-list-item.dto';

/** The full order as the customer sees it (backend `PortalServiceOrderDetail`,
 *  04 §6). `quotationId` — like `quotationFolio` on the list item — is
 *  nullable: not every order was born from a quotation, and the detail must
 *  render that cleanly rather than as a dead link. `comments` (the staff
 *  dispatch notes) is deliberately absent — that is exactly the internal note
 *  04 §6 strips. */
export interface PortalServiceOrderDetail extends PortalServiceOrderListItem {
  quotationId: string | null;
  lines: PortalServiceOrderLine[];
  linkedReports: PortalLinkedReport[];
  /** Dates only (04 §6) — never the technician assignment behind them. */
  visitDates: string[];
}

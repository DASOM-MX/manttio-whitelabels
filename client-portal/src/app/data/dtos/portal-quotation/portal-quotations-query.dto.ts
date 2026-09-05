import type { QuotationStatus } from '../../../model/enums/quotation/quotation-status.enum';

/** `GET /portal/quotations` query (backend `portalQuotationsQuerySchema`,
 *  04 §5). No `customerId` — the scope is the token's. */
export interface PortalQuotationsQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: QuotationStatus;
}

import type { QuotationStatus } from '../../../model/enums/quotation/quotation-status.enum';
import type { ServiceTaxRate, ServiceUom } from '../service';
import type { QuotationDetail } from './quotation';

export interface QuotationListQuery {
  /** Matches folio or client name. */
  q?: string;
  customerId?: string;
  status?: QuotationStatus;
  page?: number;
  limit?: number;
}

/** What the builder sends per line. **Catalog** lines carry only `serviceId` —
 *  the server resolves name/price/uom/taxRate, so a client can never quote a
 *  price the catalog never held. **Off-catalog** lines (decided 2026-07-29)
 *  carry no `serviceId` and must supply all four: the typed fields ARE the
 *  snapshot. `quantity` is a decimal string (≤3 decimals) and `discountAmount`
 *  an exact money string — never JSON floats. */
export interface QuotationLineRequest {
  serviceId?: string;
  name?: string;
  unitPrice?: string;
  uom?: ServiceUom;
  taxRate?: ServiceTaxRate;
  quantity: string;
  description?: string;
  discountAmount?: string;
}

export interface CreateQuotationRequest {
  customerId: string;
  validUntil: string;
  comments?: string;
  lines: QuotationLineRequest[];
}

/** Draft-only (409 once sent). Lines are replaced **wholesale** when present,
 *  and the server re-resolves their snapshots — so editing a draft reprices it
 *  against today's catalog. */
export interface UpdateQuotationRequest {
  validUntil?: string;
  comments?: string;
  lines?: QuotationLineRequest[];
}

export interface SendQuotationRequest {
  recipients: { contactId: string; isReviewer: boolean }[];
  message?: string;
}

/** The send is already committed when this arrives — a bounced address does not
 *  undo the recipient row or its token, so the UI names the address that failed
 *  rather than claiming nothing was sent. */
export interface SendQuotationResult {
  quotation: QuotationDetail;
  delivery: { sent: number; failed: { email: string; error: string }[] };
}

export interface CancelQuotationRequest {
  comment: string;
}

export interface DeleteQuotationRequest {
  deleteComment: string;
}

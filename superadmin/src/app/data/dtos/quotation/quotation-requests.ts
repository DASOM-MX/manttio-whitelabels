import type { QuotationStatus } from '../../../model/enums/quotation/quotation-status.enum';
import type { QuotationDetail } from './quotation';

export interface QuotationListQuery {
  /** Matches folio or client name. */
  q?: string;
  customerId?: string;
  status?: QuotationStatus;
  page?: number;
  limit?: number;
}

/** What the builder sends per line — deliberately **not** the priced fields.
 *  The server resolves name/price/uom/taxRate from the catalog; accepting them
 *  here would let the client quote a price the catalog never held. */
export interface QuotationLineRequest {
  serviceId: string;
  quantity: number;
  /** The only line field the builder may override. */
  description?: string;
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

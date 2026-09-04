import type { QuotationResponse } from '../../../model/enums/quotation/quotation-response.enum';

/** One reviewer and their answer (backend `PortalQuotationReviewer`, A14).
 *  Informational recipients are filtered out server-side, not blanked — they
 *  hold no decision, so they never reach this list. */
export interface PortalQuotationReviewer {
  contactName: string | null;
  response: QuotationResponse | null;
  respondedAt: string | null;
}

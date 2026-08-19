import type { QuotationResponse } from '../../../model/enums/quotation/quotation-response.enum';

/** One mailed contact (20 §4). The per-recipient `token` is deliberately never
 *  sent to this app: it is that contact's bearer secret and the staff UI has no
 *  use for it. */
export interface QuotationRecipient {
  id: string;
  contactId: string;
  contactName?: string;
  email: string;
  /** Only reviewers may approve/decline; the rest get a view-only copy. */
  isReviewer: boolean;
  sentAt: string;
  viewedAt?: string;
  respondedAt?: string;
  response?: QuotationResponse;
  responseReason?: string;
}

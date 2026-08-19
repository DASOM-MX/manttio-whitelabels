import type { QuotationEventRefKind } from '../../../model/enums/quotation/quotation-event-ref-kind.enum';
import type { QuotationEventType } from '../../../model/enums/quotation/quotation-event-type.enum';

/** A resolved timeline entry (20 §5). Names come resolved from the server, so a
 *  row renders as a sentence without a second fetch. Staff actions carry
 *  `actorName`; token-page actions carry `contactName` instead. */
export interface QuotationEvent {
  id: string;
  type: QuotationEventType;
  actorId?: string;
  actorName?: string;
  contactId?: string;
  contactName?: string;
  refKind?: QuotationEventRefKind;
  refId?: string;
  changes?: Record<string, unknown>;
  note?: string;
  createdAt: string;
}

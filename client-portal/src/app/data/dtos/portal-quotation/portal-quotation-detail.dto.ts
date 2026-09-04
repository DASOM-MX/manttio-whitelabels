import type { PortalQuotationListItem } from './portal-quotation-list-item.dto';
import type { PortalQuotationLine } from './portal-quotation-line.dto';
import type { PortalQuotationReviewer } from './portal-quotation-reviewer.dto';

/** The full quotation as the customer sees it (backend `PortalQuotationDetail`,
 *  04 §5) — read-only here; the approve/decline affordance is 05's own. */
export interface PortalQuotationDetail extends PortalQuotationListItem {
  comments: string | null;
  lines: PortalQuotationLine[];
  reviewers: PortalQuotationReviewer[];
}

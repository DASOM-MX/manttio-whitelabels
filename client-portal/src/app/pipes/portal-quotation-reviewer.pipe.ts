import { Pipe, PipeTransform } from '@angular/core';
import { QuotationResponse } from '../model/enums/quotation/quotation-response.enum';
import type { PortalQuotationReviewer } from '../data/dtos/portal-quotation/portal-quotation-reviewer.dto';

/** Where a reviewer stands (A14): named, plus how they answered and when.
 *  `response === null` is pending — every row here is already a reviewer,
 *  informational recipients never reach this list (server-filtered). */
@Pipe({ name: 'reviewerStanding' })
export class ReviewerStandingPipe implements PipeTransform {
  transform(reviewer: PortalQuotationReviewer): string {
    if (reviewer.response === QuotationResponse.Approved) return 'Aprobó';
    if (reviewer.response === QuotationResponse.Declined) return 'Rechazó';
    return 'Pendiente';
  }
}

@Pipe({ name: 'reviewerSeverity' })
export class ReviewerSeverityPipe implements PipeTransform {
  transform(reviewer: PortalQuotationReviewer): 'success' | 'danger' | 'warn' {
    if (reviewer.response === QuotationResponse.Approved) return 'success';
    if (reviewer.response === QuotationResponse.Declined) return 'danger';
    return 'warn';
  }
}

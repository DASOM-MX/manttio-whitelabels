import { Pipe, PipeTransform } from '@angular/core';
import { QuotationResponse } from '../model/enums/quotation/quotation-response.enum';
import type { QuotationRecipient } from '../data/dtos/quotation/quotation-recipient';

/** Where a recipient stands (20 §8): staff need to see who approved, who
 *  didn't, and who was never asked. An informational recipient is not
 *  "pending" — nobody is waiting on them. */
@Pipe({ name: 'quotationRecipientStanding' })
export class QuotationRecipientStandingPipe implements PipeTransform {
  transform(recipient: QuotationRecipient): string {
    if (!recipient.isReviewer) return 'Informativo';
    if (recipient.response === QuotationResponse.Approved) return 'Aprobó';
    if (recipient.response === QuotationResponse.Declined) return 'Rechazó';
    return 'Pendiente';
  }
}

@Pipe({ name: 'quotationRecipientSeverity' })
export class QuotationRecipientSeverityPipe implements PipeTransform {
  transform(recipient: QuotationRecipient): 'secondary' | 'success' | 'danger' | 'warn' {
    if (!recipient.isReviewer) return 'secondary';
    if (recipient.response === QuotationResponse.Approved) return 'success';
    if (recipient.response === QuotationResponse.Declined) return 'danger';
    return 'warn';
  }
}

import { Pipe, PipeTransform } from '@angular/core';
import { QUOTATION_LIVE_STATUSES } from '../model/constants/quotation/quotation-live-statuses.const';
import { QUOTATION_STATUS_LABELS } from '../model/constants/quotation/quotation-status-labels.const';
import { QUOTATION_STATUS_SEVERITIES } from '../model/constants/quotation/quotation-status-severities.const';
import type { QuotationStatus } from '../model/enums/quotation/quotation-status.enum';
import type { PortalQuotationListItem } from '../data/dtos/portal-quotation/portal-quotation-list-item.dto';

/** Pure per-row quotation mappings (no method calls in templates). */

@Pipe({ name: 'quotationStatusLabel' })
export class QuotationStatusLabelPipe implements PipeTransform {
  transform(status: QuotationStatus): string {
    return QUOTATION_STATUS_LABELS[status];
  }
}

@Pipe({ name: 'quotationStatusSeverity' })
export class QuotationStatusSeverityPipe implements PipeTransform {
  transform(
    status: QuotationStatus,
  ): 'secondary' | 'info' | 'success' | 'warn' | 'danger' | 'contrast' {
    return QUOTATION_STATUS_SEVERITIES[status];
  }
}

/** Whether the "Vencida" flag is worth showing — only while the quote is
 *  still live; on a converted/cancelled quote it is trivia (never reached
 *  here, since the portal never receives `cancelled`, but `order_created`
 *  is, and it is resolved too). */
@Pipe({ name: 'quotationShowsOverdue' })
export class QuotationShowsOverduePipe implements PipeTransform {
  transform(quotation: PortalQuotationListItem): boolean {
    return quotation.isOverdue && QUOTATION_LIVE_STATUSES.includes(quotation.status);
  }
}

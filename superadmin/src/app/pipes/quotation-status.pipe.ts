import { Pipe, PipeTransform } from '@angular/core';
import { QUOTATION_LIVE_STATUSES } from '../model/constants/quotation/quotation-live-statuses.const';
import { QUOTATION_STATUS_LABELS } from '../model/constants/quotation/quotation-status-labels.const';
import { QUOTATION_STATUS_SEVERITIES } from '../model/constants/quotation/quotation-status-severities.const';
import type { QuotationStatus } from '../model/enums/quotation/quotation-status.enum';
import type { QuotationSummary } from '../data/dtos/quotation/quotation';
import type { QuotationTally } from '../data/dtos/quotation/quotation-tally';

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

/** Whether the "Vencida" flag is worth showing.
 *
 *  `isOverdue` is computed for every quote regardless of state, but past
 *  `validUntil` only *means* something while the quote is live — that is when
 *  it blocks conversion and calls for a revise. On a cancelled or converted
 *  quote it is trivia, and rendering it there would put a red flag on rows
 *  nobody can act on. */
@Pipe({ name: 'quotationShowsOverdue' })
export class QuotationShowsOverduePipe implements PipeTransform {
  transform(quotation: QuotationSummary): boolean {
    return quotation.isOverdue && QUOTATION_LIVE_STATUSES.includes(quotation.status);
  }
}

/** The approval tally as one line (20 §8).
 *
 *  Zero reviewers gets its own sentence rather than "0 de 0 aprobaron": that
 *  quote was sent for information only, nobody can approve it, and it will sit
 *  in "En espera" until staff cancel or convert it. Rendering it like a stalled
 *  approval would send someone chasing a reviewer who does not exist. */
@Pipe({ name: 'quotationTally' })
export class QuotationTallyPipe implements PipeTransform {
  transform(tally: QuotationTally): string {
    if (tally.reviewers === 0) return 'Sin revisores — envío informativo';
    const base = `${tally.approved} de ${tally.reviewers} aprobaron`;
    return tally.declined > 0 ? `${base} · ${tally.declined} rechazó` : base;
  }
}

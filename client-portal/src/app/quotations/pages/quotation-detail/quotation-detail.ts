import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs/operators';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { LucideDownload, LucideFileSpreadsheet } from '@lucide/angular';
import { Actions, ofActionErrored, select, Store } from '@ngxs/store';
import { QuotationsState } from '../../../../state/quotations/quotations.state';
import { QuotationsLoadOne } from '../../../../state/quotations/quotations.actions';
import { PortalQuotationsService } from '../../../services/http/portal-quotations.service';
import {
  QuotationShowsOverduePipe,
  QuotationStatusLabelPipe,
  QuotationStatusSeverityPipe,
} from '../../../pipes/quotation-status.pipe';
import { ReviewerSeverityPipe, ReviewerStandingPipe } from '../../../pipes/portal-quotation-reviewer.pipe';
import { ServiceTaxRateLabelPipe } from '../../../pipes/service-tax-rate.pipe';
import { MoneyPipe } from '../../../pipes/money.pipe';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { downloadBlob, errorMessage } from '../../../data/utils';

/** Read-only quotation detail (04 §5): the frozen line snapshot, terms and
 *  the reviewer tally as the customer's side of it — who else was asked and
 *  how each answered (A14). The approve/decline affordance is 05's own; this
 *  page never renders a decision control, gated or not. No priority field
 *  exists anywhere on this wire shape (A15). */
@Component({
  selector: 'app-quotation-detail',
  imports: [
    DatePipe,
    RouterLink,
    TableModule,
    TagModule,
    QuotationShowsOverduePipe,
    QuotationStatusLabelPipe,
    QuotationStatusSeverityPipe,
    ReviewerStandingPipe,
    ReviewerSeverityPipe,
    ServiceTaxRateLabelPipe,
    MoneyPipe,
    PageHeader,
    LucideDownload,
    LucideFileSpreadsheet,
  ],
  templateUrl: './quotation-detail.html',
})
export class QuotationDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(Store);
  private readonly actions$ = inject(Actions);
  private readonly messages = inject(MessageService);
  private readonly quotationsApi = inject(PortalQuotationsService);
  private readonly destroyRef = inject(DestroyRef);

  protected quotation = select(QuotationsState.selected);
  protected loading = select(QuotationsState.selectedLoading);
  private error = select(QuotationsState.selectedError);

  /** True once the load has settled with no quotation to show — a real 404,
   *  not the initial-paint gap before the dispatch below runs. */
  protected notFound = computed(() => !this.loading() && !this.quotation() && !!this.error());

  protected downloading = signal(false);

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.store.dispatch(new QuotationsLoadOne(id));

    this.actions$
      .pipe(ofActionErrored(QuotationsLoadOne), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo cargar la cotización',
          detail: this.error() ?? undefined,
        });
      });
  }

  protected downloadPdf(): void {
    const q = this.quotation();
    if (!q || this.downloading()) return;
    this.downloading.set(true);
    this.quotationsApi
      .downloadPdf(q.id)
      .pipe(finalize(() => this.downloading.set(false)))
      .subscribe({
        next: (blob) => downloadBlob(blob, `${q.folio}.pdf`),
        error: (err: unknown) =>
          this.messages.add({
            severity: 'error',
            summary: 'No se pudo descargar el PDF',
            detail: errorMessage(err, 'Inténtalo de nuevo.'),
          }),
      });
  }
}

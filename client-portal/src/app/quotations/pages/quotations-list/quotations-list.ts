import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { LucideDownload, LucideFileSpreadsheet } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { QuotationsState } from '../../../../state/quotations/quotations.state';
import { QuotationsLoadList } from '../../../../state/quotations/quotations.actions';
import { ListQueryService, keyIn } from '../../../services/table/list-query.service';
import { tableLoading } from '../../../services/table/table-loading';
import { PortalQuotationsService } from '../../../services/http/portal-quotations.service';
import { QUOTATION_STATUS_LABELS } from '../../../model/constants/quotation/quotation-status-labels.const';
import {
  QuotationShowsOverduePipe,
  QuotationStatusLabelPipe,
  QuotationStatusSeverityPipe,
} from '../../../pipes/quotation-status.pipe';
import { MoneyPipe } from '../../../pipes/money.pipe';
import { FiltersPopover } from '../../../shared/components/filters-popover/filters-popover';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { downloadBlob, errorMessage } from '../../../data/utils';
import type { PortalQuotationListItem } from '../../../data/dtos/portal-quotation/portal-quotation-list-item.dto';
import type { PortalQuotationsQuery } from '../../../data/dtos/portal-quotation/portal-quotations-query.dto';
import type { QuotationStatus } from '../../../model/enums/quotation/quotation-status.enum';

/** Cotizaciones (04 §5): server-paginated list, filters + page persisted in
 *  the URL — the same `ListQueryService` idiom Reportes/Contratos use.
 *  Read-only: the approve/decline affordance is 05's own, not built here.
 *  The backend scopes rows to the token's customer and to statuses the
 *  customer was actually mailed (A7). */
@Component({
  selector: 'app-quotations-list',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    TableModule,
    SelectModule,
    InputTextModule,
    TagModule,
    QuotationShowsOverduePipe,
    QuotationStatusLabelPipe,
    QuotationStatusSeverityPipe,
    MoneyPipe,
    FiltersPopover,
    PageHeader,
    LucideDownload,
    LucideFileSpreadsheet,
  ],
  providers: [ListQueryService],
  templateUrl: './quotations-list.html',
})
export class QuotationsList {
  private readonly store = inject(Store);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  private readonly quotationsApi = inject(PortalQuotationsService);
  protected readonly list = inject(ListQueryService);

  protected quotations = select(QuotationsState.items);
  protected total = select(QuotationsState.total);
  protected loading = select(QuotationsState.loading);
  protected tableBusy = tableLoading(this.loading, this.quotations);

  protected search = new FormControl('', { nonNullable: true });
  protected statusFilter = new FormControl<QuotationStatus | ''>('', { nonNullable: true });

  protected statusOptions = [
    { label: 'Todos los estados', value: '' },
    ...(Object.entries(QUOTATION_STATUS_LABELS) as [QuotationStatus, string][])
      // `draft`/`cancelled` never reach the portal (A7) — offering them would
      // filter to an always-empty result.
      .filter(([value]) => value !== 'draft' && value !== 'cancelled')
      .map(([value, label]) => ({ label, value })),
  ];

  /** Distinguishes the empty states (04 §1): "nothing here yet" vs "nothing
   *  matches your filters". Set from the URL params directly, so it stays
   *  correct on the very first paint. */
  protected hasFilters = signal(false);

  protected downloadingId = signal<string | null>(null);

  constructor() {
    this.list.init({
      read: (params) => {
        this.search.setValue(params.get('q') ?? '', { emitEvent: false });
        this.statusFilter.setValue(keyIn(QUOTATION_STATUS_LABELS, params.get('status')), {
          emitEvent: false,
        });
        this.hasFilters.set(!!params.get('q') || !!params.get('status'));
      },
      write: () => ({
        q: this.search.value || null,
        status: this.statusFilter.value || null,
      }),
      load: (page) => this.store.dispatch(new QuotationsLoadList(this.query(page))),
    });
    this.list.bindFilters({
      debounced: [this.search],
      instant: [this.statusFilter],
    });
  }

  private query(page: number): PortalQuotationsQuery {
    return {
      page,
      limit: this.list.PAGE_SIZE,
      search: this.search.value || undefined,
      status: this.statusFilter.value || undefined,
    };
  }

  protected openQuotation(quotation: PortalQuotationListItem): void {
    this.router.navigate(['/quotations', quotation.id]);
  }

  protected downloadPdf(quotation: PortalQuotationListItem): void {
    if (this.downloadingId()) return;
    this.downloadingId.set(quotation.id);
    this.quotationsApi
      .downloadPdf(quotation.id)
      .pipe(finalize(() => this.downloadingId.set(null)))
      .subscribe({
        next: (blob) => downloadBlob(blob, `${quotation.folio}.pdf`),
        error: (err: unknown) =>
          this.messages.add({
            severity: 'error',
            summary: 'No se pudo descargar el PDF',
            detail: errorMessage(err, 'Inténtalo de nuevo.'),
          }),
      });
  }
}

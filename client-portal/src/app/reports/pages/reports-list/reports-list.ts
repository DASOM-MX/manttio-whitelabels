import { Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs/operators';
import { TableModule } from 'primeng/table';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { LucideDownload, LucideFileText } from '@lucide/angular';
import { Actions, ofActionErrored, select, Store } from '@ngxs/store';
import { ReportsState } from '../../../../state/reports/reports.state';
import { ReportsLoadList } from '../../../../state/reports/reports.actions';
import { ListQueryService } from '../../../services/table/list-query.service';
import { tableLoading } from '../../../services/table/table-loading';
import { PortalReportsService } from '../../../services/http/portal-reports.service';
import { FiltersPopover } from '../../../shared/components/filters-popover/filters-popover';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { ReportStatusLabelPipe, ReportStatusSeverityPipe } from '../../../pipes/report-status.pipe';
import { ListJoinPipe } from '../../../pipes/list-join.pipe';
import { downloadBlob, errorMessage, toCalendarDate } from '../../../data/utils';
import type { PortalReportListItem } from '../../../data/dtos/portal-report/portal-report-list-item.dto';
import type { PortalReportsQuery } from '../../../data/dtos/portal-report/portal-reports-query.dto';

/** Reportes (04 §3): server-paginated list, filters + page persisted in the
 *  URL (`ListQueryService` — the users-list idiom). The backend already
 *  scopes rows to the token's customer and to released statuses only (A7),
 *  so there is nothing left for this page to filter client-side. */
@Component({
  selector: 'app-reports-list',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    TableModule,
    InputTextModule,
    DatePickerModule,
    TagModule,
    ReportStatusLabelPipe,
    ReportStatusSeverityPipe,
    ListJoinPipe,
    FiltersPopover,
    PageHeader,
    LucideDownload,
    LucideFileText,
  ],
  providers: [ListQueryService],
  templateUrl: './reports-list.html',
})
export class ReportsList {
  private readonly store = inject(Store);
  private readonly router = inject(Router);
  private readonly actions$ = inject(Actions);
  private readonly messages = inject(MessageService);
  private readonly reportsApi = inject(PortalReportsService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly list = inject(ListQueryService);

  protected reports = select(ReportsState.items);
  protected total = select(ReportsState.total);
  protected loading = select(ReportsState.loading);
  protected tableBusy = tableLoading(this.loading, this.reports);

  private readonly ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  protected search = new FormControl('', { nonNullable: true });
  protected dateRange = new FormControl<Date[] | null>(null);

  /** Whether any filter is active — distinguishes the empty states (04 §1):
   *  "nothing here yet" vs "nothing matches your filters". Set from the URL
   *  params directly (`list.init`'s `read`), not from the form controls, so
   *  it stays correct on the very first paint. */
  protected hasFilters = signal(false);

  protected downloadingId = signal<string | null>(null);

  constructor() {
    this.list.init({
      read: (params) => {
        const from = this.parseDateParam(params.get('from'));
        const to = this.parseDateParam(params.get('to'));
        this.search.setValue(params.get('q') ?? '', { emitEvent: false });
        this.dateRange.setValue(from ? (to ? [from, to] : [from]) : null, { emitEvent: false });
        this.hasFilters.set(!!params.get('q') || !!params.get('from') || !!params.get('to'));
      },
      write: () => {
        const range = this.dateRange.value;
        return {
          q: this.search.value || null,
          from: range?.[0] ? toCalendarDate(range[0]) : null,
          to: range?.[1] ? toCalendarDate(range[1]) : null,
        };
      },
      load: (page) => this.store.dispatch(new ReportsLoadList(this.query(page))),
    });
    this.list.bindFilters({
      debounced: [this.search],
      instant: [this.dateRange],
    });

    this.actions$
      .pipe(ofActionErrored(ReportsLoadList), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const detail = this.store.selectSnapshot(ReportsState.error);
        this.messages.add({ severity: 'error', summary: 'No se pudieron cargar los reportes', detail: detail ?? undefined });
      });
  }

  private query(page: number): PortalReportsQuery {
    const range = this.dateRange.value;
    return {
      page,
      limit: this.list.PAGE_SIZE,
      search: this.search.value || undefined,
      dateFrom: range?.[0] ? toCalendarDate(range[0]) : undefined,
      dateTo: range?.[1] ? toCalendarDate(range[1]) : undefined,
    };
  }

  /** Local-midnight parse of a sanitized `YYYY-MM-DD` URL param — anything
   *  malformed is dropped, never fed to the picker or the API. */
  private parseDateParam(value: string | null): Date | null {
    if (!value || !this.ISO_DATE.test(value)) return null;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  /** Whole row clicks through to the report; the PDF action stays a direct
   *  download without navigating. */
  protected openReport(report: PortalReportListItem): void {
    this.router.navigate(['/reports', report.id]);
  }

  protected downloadPdf(report: PortalReportListItem): void {
    if (this.downloadingId()) return;
    this.downloadingId.set(report.id);
    this.reportsApi
      .downloadPdf(report.id)
      .pipe(finalize(() => this.downloadingId.set(null)))
      .subscribe({
        next: (blob) => downloadBlob(blob, `reporte-${report.id}.pdf`),
        error: (err: unknown) =>
          this.messages.add({
            severity: 'error',
            summary: 'No se pudo descargar el PDF',
            detail: errorMessage(err, 'Inténtalo de nuevo.'),
          }),
      });
  }
}

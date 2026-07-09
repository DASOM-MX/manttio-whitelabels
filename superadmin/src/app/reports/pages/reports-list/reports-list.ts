import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { TagModule } from 'primeng/tag';
import { LucideEye, LucideFileText, LucideTrash2 } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { ReportsState } from '../../../../state/reports/reports.state';
import { LoadReports } from '../../../../state/reports/reports.actions';
import { ReportTemplatesState } from '../../../../state/report-templates/report-templates.state';
import { LoadTemplates } from '../../../../state/report-templates/report-templates.actions';
import { AuthState } from '../../../../state/auth/auth.state';
import { REPORT_STATUS_LABELS } from '../../../model/constants/report/report-status-labels.const';
import { ReportStatusLabelPipe, ReportStatusSeverityPipe } from '../../../pipes/report-status.pipe';
import { DeleteReportDialog } from '../../components/delete-report-dialog/delete-report-dialog';
import type { ReportListQuery, ReportStatus, ReportSummary } from '../../../data/dtos/report';

const PAGE_SIZE = 10;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Local-midnight parse of a sanitized `YYYY-MM-DD` URL param — anything
 *  malformed is dropped, never fed to the picker or the API. */
const parseDateParam = (value: string | null): Date | null => {
  if (!value || !ISO_DATE.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Reports browser (06 §3). Technicians get the exact same page as
 *  "Mis reportes": the backend scopes their query; the UI locks the filters
 *  down to search + dates and hides destructive actions — same components,
 *  never a forked variant (14 §4). Filters + page persist as GET query
 *  params (?q&status&template&from&to&page — 05 §3 canon): the queryParamMap
 *  subscription sanitizes and is the single load path, so browser
 *  back/forward walks the filter history. */
@Component({
  selector: 'app-reports-list',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    TableModule,
    SelectModule,
    InputTextModule,
    DatePickerModule,
    TagModule,
    ReportStatusLabelPipe,
    ReportStatusSeverityPipe,
    DeleteReportDialog,
    LucideEye,
    LucideTrash2,
    LucideFileText,
  ],
  templateUrl: './reports-list.html',
})
export class ReportsList {
  private store = inject(Store);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  protected reports = select(ReportsState.items);
  protected total = select(ReportsState.total);
  protected loading = select(ReportsState.loading);
  private me = select(AuthState.me);
  private templates = select(ReportTemplatesState.items);

  protected readonly PAGE_SIZE = PAGE_SIZE;
  protected isTechnician = computed(() => this.me()?.role === 'technician');

  protected search = new FormControl('', { nonNullable: true });
  protected statusFilter = new FormControl<ReportStatus | ''>('', { nonNullable: true });
  protected templateFilter = new FormControl('', { nonNullable: true });
  protected dateRange = new FormControl<Date[] | null>(null);

  protected statusOptions = [
    { label: 'Todos los estados', value: '' },
    ...(Object.entries(REPORT_STATUS_LABELS) as [ReportStatus, string][]).map(([value, label]) => ({
      label,
      value,
    })),
  ];

  protected templateOptions = computed(() => [
    { label: 'Todas las plantillas', value: '' },
    ...this.templates().map((t) => ({ label: t.name, value: t.id })),
  ]);

  /** Current page (1-based) as read from the URL. */
  private page = 1;
  /** Paginator offset for the table, kept in sync with the URL page. */
  protected first = signal(0);
  protected deleteDialog = viewChild<DeleteReportDialog>('deleteDialog');

  constructor() {
    if (!this.isTechnician()) this.store.dispatch(new LoadTemplates({ limit: 100 }));

    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
      const search = params.get('q') ?? '';
      const statusParam = params.get('status') ?? '';
      const status = (statusParam in REPORT_STATUS_LABELS ? statusParam : '') as ReportStatus | '';
      const template = params.get('template') ?? '';
      const from = parseDateParam(params.get('from'));
      const to = parseDateParam(params.get('to'));
      const range = from ? (to ? [from, to] : [from]) : null;

      this.page = page;
      this.first.set((page - 1) * PAGE_SIZE);
      this.search.setValue(search, { emitEvent: false });
      this.statusFilter.setValue(status, { emitEvent: false });
      this.templateFilter.setValue(template, { emitEvent: false });
      this.dateRange.setValue(range, { emitEvent: false });
      this.store.dispatch(new LoadReports(this.query(page)));
    });

    this.search.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.applyFilters());
    this.statusFilter.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.applyFilters());
    this.templateFilter.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.applyFilters());
    this.dateRange.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.applyFilters());
  }

  private query(page: number): ReportListQuery {
    const range = this.dateRange.value;
    const iso = (d: Date | undefined | null) => (d ? d.toISOString().slice(0, 10) : undefined);
    return {
      page,
      limit: PAGE_SIZE,
      search: this.search.value || undefined,
      status: this.statusFilter.value || undefined,
      templateId: this.templateFilter.value || undefined,
      from: iso(range?.[0]),
      to: iso(range?.[1]),
    };
  }

  /** Pushes the filter/page state into the URL; the queryParamMap
   *  subscription picks it up and loads. Empty values drop off the URL. */
  private applyFilters(page = 1): void {
    const range = this.dateRange.value;
    const iso = (d: Date | undefined | null) => (d ? d.toISOString().slice(0, 10) : null);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.search.value || null,
        status: this.statusFilter.value || null,
        template: this.templateFilter.value || null,
        from: iso(range?.[0]),
        to: iso(range?.[1]),
        page: page > 1 ? page : null,
      },
    });
  }

  protected onLazyLoad(event: TableLazyLoadEvent): void {
    const rows = event.rows ?? PAGE_SIZE;
    const page = Math.floor((event.first ?? 0) / rows) + 1;
    if (page !== this.page) this.applyFilters(page);
  }

  /** After a delete: step back a page if this one just emptied, else refetch. */
  protected refresh(): void {
    if (this.reports().length === 0 && this.page > 1) {
      this.applyFilters(this.page - 1);
      return;
    }
    this.store.dispatch(new LoadReports(this.query(this.page)));
  }

  protected openDelete(report: ReportSummary): void {
    this.deleteDialog()?.open(report);
  }
}

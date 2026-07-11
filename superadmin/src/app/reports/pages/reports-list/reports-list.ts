import { Component, computed, inject, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
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
import { ListQueryService, keyIn } from '../../../services/table/list-query.service';
import { REPORT_STATUS_LABELS } from '../../../model/constants/report/report-status-labels.const';
import { ReportStatusLabelPipe, ReportStatusSeverityPipe } from '../../../pipes/report-status.pipe';
import { DeleteReportDialog } from '../../components/delete-report-dialog/delete-report-dialog';
import type { ReportListQuery, ReportStatus, ReportSummary } from '../../../data/dtos/report';

/** Reports browser (06 §3). Technicians get the exact same page as
 *  "Mis reportes": the backend scopes their query; the UI locks the filters
 *  down to search + dates and hides destructive actions — same components,
 *  never a forked variant (14 §4). Filters + page persist as GET query
 *  params (?q&status&template&from&to&page) through ListQueryService
 *  (05 §3 canon) — only the param mapping, query building and dispatch live
 *  here. */
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
  providers: [ListQueryService],
  templateUrl: './reports-list.html',
})
export class ReportsList {
  private store = inject(Store);
  private router = inject(Router);
  protected list = inject(ListQueryService);

  protected reports = select(ReportsState.items);
  protected total = select(ReportsState.total);
  protected loading = select(ReportsState.loading);
  private me = select(AuthState.me);
  private templates = select(ReportTemplatesState.items);

  private readonly ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
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

  protected deleteDialog = viewChild<DeleteReportDialog>('deleteDialog');

  constructor() {
    if (!this.isTechnician()) this.store.dispatch(new LoadTemplates({ limit: 100 }));

    this.list.init({
      read: (params) => {
        const from = this.parseDateParam(params.get('from'));
        const to = this.parseDateParam(params.get('to'));
        this.search.setValue(params.get('q') ?? '', { emitEvent: false });
        this.statusFilter.setValue(keyIn(REPORT_STATUS_LABELS, params.get('status')), {
          emitEvent: false,
        });
        this.templateFilter.setValue(params.get('template') ?? '', { emitEvent: false });
        this.dateRange.setValue(from ? (to ? [from, to] : [from]) : null, { emitEvent: false });
      },
      write: () => {
        const range = this.dateRange.value;
        return {
          q: this.search.value || null,
          status: this.statusFilter.value || null,
          template: this.templateFilter.value || null,
          from: this.isoDate(range?.[0]) ?? null,
          to: this.isoDate(range?.[1]) ?? null,
        };
      },
      load: (page) => this.store.dispatch(new LoadReports(this.query(page))),
    });
    this.list.bindFilters({
      debounced: [this.search],
      instant: [this.statusFilter, this.templateFilter, this.dateRange],
    });
  }

  private query(page: number): ReportListQuery {
    const range = this.dateRange.value;
    return {
      page,
      limit: this.list.PAGE_SIZE,
      search: this.search.value || undefined,
      status: this.statusFilter.value || undefined,
      templateId: this.templateFilter.value || undefined,
      from: this.isoDate(range?.[0]),
      to: this.isoDate(range?.[1]),
    };
  }

  /** Local-midnight parse of a sanitized `YYYY-MM-DD` URL param — anything
   *  malformed is dropped, never fed to the picker or the API. */
  private parseDateParam(value: string | null): Date | null {
    if (!value || !this.ISO_DATE.test(value)) return null;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private isoDate(d: Date | undefined | null): string | undefined {
    return d ? d.toISOString().slice(0, 10) : undefined;
  }

  protected refresh(): void {
    this.list.refresh(this.reports().length);
  }

  protected openDelete(report: ReportSummary): void {
    this.deleteDialog()?.open(report);
  }

  /** Whole row clicks through to the report (05 §3 QA pattern); the action
   *  links remain the keyboard path. */
  protected openReport(report: ReportSummary): void {
    this.router.navigate(['/reports', report.id]);
  }
}

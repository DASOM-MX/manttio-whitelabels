import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
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
import type { ReportStatus, ReportSummary } from '../../../data/dtos/report';

const PAGE_SIZE = 10;

/** Reports browser (06 §3). Technicians get the exact same page as
 *  "Mis reportes": the backend scopes their query; the UI locks the filters
 *  down to search + dates and hides destructive actions — same components,
 *  never a forked variant (14 §4). */
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

  private page = signal(1);
  protected deleteDialog = viewChild<DeleteReportDialog>('deleteDialog');

  constructor() {
    if (!this.isTechnician()) this.store.dispatch(new LoadTemplates({ limit: 100 }));

    this.search.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.reload(1));
    this.statusFilter.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.reload(1));
    this.templateFilter.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.reload(1));
    this.dateRange.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.reload(1));
  }

  protected onLazyLoad(event: TableLazyLoadEvent): void {
    const first = event.first ?? 0;
    const rows = event.rows ?? PAGE_SIZE;
    this.reload(Math.floor(first / rows) + 1, rows);
  }

  protected reload(page = this.page(), limit = PAGE_SIZE): void {
    this.page.set(page);
    const range = this.dateRange.value;
    const iso = (d: Date | undefined | null) => (d ? d.toISOString().slice(0, 10) : undefined);
    this.store.dispatch(
      new LoadReports({
        page,
        limit,
        search: this.search.value || undefined,
        status: this.statusFilter.value || undefined,
        templateId: this.templateFilter.value || undefined,
        from: iso(range?.[0]),
        to: iso(range?.[1]),
      }),
    );
  }

  protected openDelete(report: ReportSummary): void {
    this.deleteDialog()?.open(report);
  }
}

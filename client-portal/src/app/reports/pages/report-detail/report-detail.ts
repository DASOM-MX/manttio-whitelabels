import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs/operators';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { LucideDownload, LucideFileX } from '@lucide/angular';
import { Actions, ofActionErrored, select, Store } from '@ngxs/store';
import { ReportsState } from '../../../../state/reports/reports.state';
import { ReportsLoadOne } from '../../../../state/reports/reports.actions';
import { PortalReportsService } from '../../../services/http/portal-reports.service';
import { AnswerValuePipe, ColumnsGridPipe } from '../../../pipes/report-answer.pipe';
import { ReportStatusLabelPipe, ReportStatusSeverityPipe } from '../../../pipes/report-status.pipe';
import { ListJoinPipe } from '../../../pipes/list-join.pipe';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { downloadBlob, errorMessage } from '../../../data/utils';

/** Read-only report detail (04 §3) — the finished report as the customer
 *  received it: header block (technician always named, A13), the answered
 *  template snapshot rendered from the frozen sections, photos, comments and
 *  signature. Reuses superadmin's `report-view` read-only posture. */
@Component({
  selector: 'app-report-detail',
  imports: [
    DatePipe,
    RouterLink,
    TagModule,
    AnswerValuePipe,
    ColumnsGridPipe,
    ReportStatusLabelPipe,
    ReportStatusSeverityPipe,
    ListJoinPipe,
    PageHeader,
    LucideDownload,
    LucideFileX,
  ],
  templateUrl: './report-detail.html',
})
export class ReportDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(Store);
  private readonly actions$ = inject(Actions);
  private readonly messages = inject(MessageService);
  private readonly reportsApi = inject(PortalReportsService);
  private readonly destroyRef = inject(DestroyRef);

  protected report = select(ReportsState.selected);
  protected loading = select(ReportsState.selectedLoading);
  private error = select(ReportsState.selectedError);

  /** True once the load has settled with no report to show — a real 404, not
   *  the initial-paint gap before the dispatch below runs. */
  protected notFound = computed(() => !this.loading() && !this.report() && !!this.error());

  protected downloading = signal(false);

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.store.dispatch(new ReportsLoadOne(id));

    this.actions$
      .pipe(ofActionErrored(ReportsLoadOne), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo cargar el reporte',
          detail: this.error() ?? undefined,
        });
      });
  }

  protected downloadPdf(): void {
    const r = this.report();
    if (!r || this.downloading()) return;
    this.downloading.set(true);
    this.reportsApi
      .downloadPdf(r.id)
      .pipe(finalize(() => this.downloading.set(false)))
      .subscribe({
        next: (blob) => downloadBlob(blob, `reporte-${r.id}.pdf`),
        error: (err: unknown) =>
          this.messages.add({
            severity: 'error',
            summary: 'No se pudo descargar el PDF',
            detail: errorMessage(err, 'Inténtalo de nuevo.'),
          }),
      });
  }
}

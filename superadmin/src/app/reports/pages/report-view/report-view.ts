import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { LucideArrowLeft, LucideDownload } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { ReportsState } from '../../../../state/reports/reports.state';
import { LoadReport } from '../../../../state/reports/reports.actions';
import { AuthState } from '../../../../state/auth/auth.state';
import { ReportsService } from '../../../../http/reports.service';
import { REPORT_STATUS_LABELS } from '../../../model/constants/report/report-status-labels.const';
import { REPORT_STATUS_SEVERITIES } from '../../../model/constants/report/report-status-severities.const';
import { ReportStatusLabelPipe, ReportStatusSeverityPipe } from '../../../pipes/report-status.pipe';
import { AnswerValuePipe, ColumnsGridPipe } from '../../../pipes/report-answer.pipe';
import { errorMessage } from '../../../data/utils';

/** Read-only report detail (06 §3): template-shaped body rendered FROM THE
 *  ANSWER SNAPSHOT (§5.5) at each section's captured column count — never by
 *  re-joining the live template, never assuming the old fixed HVAC shape. */
@Component({
  selector: 'app-report-view',
  imports: [
    RouterLink,
    TagModule,
    ReportStatusLabelPipe,
    ReportStatusSeverityPipe,
    AnswerValuePipe,
    ColumnsGridPipe,
    LucideArrowLeft,
    LucideDownload,
  ],
  templateUrl: './report-view.html',
})
export class ReportView {
  private store = inject(Store);
  private route = inject(ActivatedRoute);
  private api = inject(ReportsService);
  private messages = inject(MessageService);

  protected report = select(ReportsState.selected);
  private me = select(AuthState.me);
  protected isTechnician = computed(() => this.me()?.role === 'technician');
  protected downloading = signal(false);

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.store.dispatch(new LoadReport(id));
  }

  protected statusLabel = computed(() => {
    const r = this.report();
    return r ? REPORT_STATUS_LABELS[r.status] : '';
  });
  protected statusSeverity = computed(() => {
    const r = this.report();
    return r ? REPORT_STATUS_SEVERITIES[r.status] : ('secondary' as const);
  });

  protected downloadPdf(): void {
    const r = this.report();
    if (!r || this.downloading()) return;
    this.downloading.set(true);
    this.api.pdf(r.id).subscribe({
      next: (blob) => {
        this.downloading.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte-${r.folio ?? r.id}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (err) => {
        this.downloading.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo descargar el PDF',
          detail: errorMessage(err, 'Inténtalo de nuevo.'),
        });
      },
    });
  }
}

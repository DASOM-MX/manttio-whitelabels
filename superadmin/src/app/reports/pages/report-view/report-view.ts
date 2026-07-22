import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TagModule } from 'primeng/tag';
import { ConfirmationService, MessageService } from 'primeng/api';
import { LucideDownload, LucideMail } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { ReportsState } from '../../../../state/reports/reports.state';
import { LoadReport } from '../../../../state/reports/reports.actions';
import { AuthState } from '../../../../state/auth/auth.state';
import { ReportsService } from '../../../services/http/reports.service';
import { hasRole } from '../../../guards/has-role.guard';
import { ReportStatus } from '../../../data/dtos/report';
import { REPORT_STATUS_LABELS } from '../../../model/constants/report/report-status-labels.const';
import { REPORT_STATUS_SEVERITIES } from '../../../model/constants/report/report-status-severities.const';
import { AnswerValuePipe, ColumnsGridPipe } from '../../../pipes/report-answer.pipe';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { errorMessage } from '../../../data/utils';

/** Read-only report detail (06 §3): template-shaped body rendered FROM THE
 *  ANSWER SNAPSHOT (§5.5) at each section's captured column count — never by
 *  re-joining the live template, never assuming the old fixed HVAC shape. */
@Component({
  selector: 'app-report-view',
  imports: [
    TagModule,
    AnswerValuePipe,
    ColumnsGridPipe,
    PageHeader,
    LucideDownload,
    LucideMail,
  ],
  templateUrl: './report-view.html',
})
export class ReportView {
  private store = inject(Store);
  private route = inject(ActivatedRoute);
  private api = inject(ReportsService);
  private messages = inject(MessageService);
  private confirmation = inject(ConfirmationService);

  protected report = select(ReportsState.selected);
  private me = select(AuthState.me);
  protected isTechnician = computed(() => this.me()?.role === 'technician');
  protected downloading = signal(false);
  protected sending = signal(false);

  /** Email resend (field-app parity): finished/mailed reports only, and only
   *  for the admin tier — the backend gate on POST /reports/:id/email is
   *  owner/admin. */
  protected canEmail = computed(() => {
    const r = this.report();
    return (
      !!r &&
      (r.status === ReportStatus.Finished || r.status === ReportStatus.Mailed) &&
      hasRole(this.me(), ['owner', 'admin'])
    );
  });

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

  /** Sends the report to the customer (backend defaults `to` to the customer
   *  email when omitted) — same confirm-first flow as the field app's
   *  "Enviar por correo". Reloads the report so a `finished` status flips to
   *  `mailed` in the header. */
  protected emailReport(): void {
    const r = this.report();
    if (!r || !this.canEmail() || this.sending()) return;
    this.confirmation.confirm({
      header: 'Enviar reporte al cliente',
      message: `Se enviará una copia del reporte al correo del cliente ${r.customerName}. ¿Continuar?`,
      acceptLabel: 'Enviar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'btn-primary',
      rejectButtonStyleClass: 'btn-neutral',
      accept: () => {
        this.sending.set(true);
        this.api.email(r.id, {}).subscribe({
          next: () => {
            this.sending.set(false);
            this.messages.add({ severity: 'success', summary: 'Reporte enviado al cliente' });
            this.store.dispatch(new LoadReport(r.id));
          },
          error: (err) => {
            this.sending.set(false);
            this.messages.add({
              severity: 'error',
              summary: 'No se pudo enviar el reporte',
              detail: errorMessage(err, 'Inténtalo de nuevo.'),
            });
          },
        });
      },
    });
  }

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

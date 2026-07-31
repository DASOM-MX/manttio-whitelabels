import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { ConfirmationService, MessageService } from 'primeng/api';
import {
  LucideBellRing,
  LucideCopy,
  LucideDynamicIcon,
  LucidePencil,
  LucideRefreshCw,
  LucideSend,
  LucideTrash2,
  LucideXCircle,
} from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { QuotationsState } from '../../../../state/quotations/quotations.state';
import {
  LoadQuotationDetail,
  LoadQuotationTimeline,
  ReviseQuotation,
} from '../../../../state/quotations/quotations.actions';
import { AuthState } from '../../../../state/auth/auth.state';
import { hasRole } from '../../../guards/has-role.guard';
import { QUOTATION_LIVE_STATUSES } from '../../../model/constants/quotation/quotation-live-statuses.const';
import { QuotationStatus } from '../../../model/enums/quotation/quotation-status.enum';
import { MoneyPipe } from '../../../pipes/money.pipe';
import { QuantityPipe } from '../../../pipes/quantity.pipe';
import { RelativeTimePipe } from '../../../pipes/relative-time.pipe';
import { ServiceTaxRateShortPipe } from '../../../pipes/service-tax-rate.pipe';
import { ServiceUomShortPipe } from '../../../pipes/service-uom.pipe';
import {
  QuotationShowsOverduePipe,
  QuotationStatusLabelPipe,
  QuotationStatusSeverityPipe,
  QuotationTallyPipe,
} from '../../../pipes/quotation-status.pipe';
import {
  QuotationRecipientSeverityPipe,
  QuotationRecipientStandingPipe,
} from '../../../pipes/quotation-recipient.pipe';
import {
  QuotationEventActorPipe,
  QuotationEventDetailPipe,
  QuotationEventIconPipe,
  QuotationEventLabelPipe,
} from '../../../pipes/quotation-event.pipe';
import { QuotationsService } from '../../../services/http/quotations.service';
import { SendQuotationDialog } from '../../components/send-quotation-dialog/send-quotation-dialog';
import { CancelQuotationDialog } from '../../components/cancel-quotation-dialog/cancel-quotation-dialog';
import { DeleteQuotationDialog } from '../../components/delete-quotation-dialog/delete-quotation-dialog';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { errorMessage } from '../../../data/utils';

/** Quotation detail (20 §8) — header with the tally, the frozen lines,
 *  recipients with each reviewer's standing, and the append-only timeline.
 *
 *  **Crear orden is deliberately absent.** The conversion has to open a
 *  `service_order` in the same transaction and that table does not exist until
 *  19, so `POST /:id/order` is not implemented and `order_created` is
 *  unreachable. Rendering a button that 404s would be worse than not offering
 *  it. */
@Component({
  selector: 'app-quotation-view',
  imports: [
    DatePipe,
    RouterLink,
    TableModule,
    TabsModule,
    TagModule,
    LucideDynamicIcon,
    MoneyPipe,
    QuantityPipe,
    RelativeTimePipe,
    ServiceTaxRateShortPipe,
    ServiceUomShortPipe,
    QuotationShowsOverduePipe,
    QuotationStatusLabelPipe,
    QuotationStatusSeverityPipe,
    QuotationTallyPipe,
    QuotationRecipientSeverityPipe,
    QuotationRecipientStandingPipe,
    QuotationEventActorPipe,
    QuotationEventDetailPipe,
    QuotationEventIconPipe,
    QuotationEventLabelPipe,
    SendQuotationDialog,
    CancelQuotationDialog,
    DeleteQuotationDialog,
    PageHeader,
    LucideBellRing,
    LucideCopy,
    LucidePencil,
    LucideRefreshCw,
    LucideSend,
    LucideTrash2,
    LucideXCircle,
  ],
  templateUrl: './quotation-view.html',
})
export class QuotationView {
  private store = inject(Store);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private messages = inject(MessageService);
  private confirmation = inject(ConfirmationService);
  private quotationsService = inject(QuotationsService);

  protected quotation = select(QuotationsState.selected);
  protected loadFailed = select(QuotationsState.selectedError);
  protected timeline = select(QuotationsState.timeline);
  protected timelineLoading = select(QuotationsState.timelineLoading);
  private me = select(AuthState.me);

  /** Recipients / timeline tab. Recipients leads: "did it reach them, and what
   *  did they say" is the question staff open a sent quote with. */
  protected activeTab = signal('destinatarios');

  protected sendDialog = viewChild<SendQuotationDialog>('sendDialog');
  protected cancelDialog = viewChild<CancelQuotationDialog>('cancelDialog');
  protected deleteDialog = viewChild<DeleteQuotationDialog>('deleteDialog');

  protected isDraft = computed(() => this.quotation()?.status === QuotationStatus.Draft);

  /** Live = still actionable. Sending, revising and cancelling are all offered
   *  here and all rejected by the API once the quote is resolved. */
  protected isLive = computed(() => {
    const status = this.quotation()?.status;
    return !!status && QUOTATION_LIVE_STATUSES.includes(status);
  });

  /** Delete is admin-tier: office can retire a quote with Cancelar (a decision
   *  the client may still be shown) but not remove it from the tenant's lists. */
  protected canDelete = computed(() => hasRole(this.me(), ['owner', 'admin']));

  /** Reminders only make sense while an answer can still land: sent (not a
   *  draft), still live, not past its date. Per-row eligibility (pending
   *  reviewer) is checked in the template off the recipient itself. */
  protected canRemind = computed(() => {
    const quotation = this.quotation();
    return (
      !!quotation &&
      quotation.status !== QuotationStatus.Draft &&
      QUOTATION_LIVE_STATUSES.includes(quotation.status) &&
      !quotation.isOverdue
    );
  });

  /** The contact whose reminder is in flight — disables just that row's bell. */
  protected remindingId = signal<string | null>(null);

  protected readonly skeletonRows = [0, 1, 2];

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.reload(id);
  }

  protected setTab(value: string | number | undefined): void {
    this.activeTab.set(String(value ?? 'destinatarios'));
  }

  protected refresh(): void {
    const id = this.quotation()?.id ?? this.route.snapshot.paramMap.get('id');
    if (id) this.reload(id);
  }

  protected openSend(): void {
    const quotation = this.quotation();
    if (quotation) this.sendDialog()?.open(quotation);
  }

  protected openCancel(): void {
    const quotation = this.quotation();
    if (quotation) this.cancelDialog()?.open(quotation);
  }

  protected openDelete(): void {
    const quotation = this.quotation();
    if (quotation) this.deleteDialog()?.open(quotation);
  }

  protected onDeleted(): void {
    this.router.navigate(['/quotations']);
  }

  /** Revise opens a **new** linked draft and cancels this one — never edits in
   *  place, so a link the client already holds keeps resolving to the numbers
   *  they were actually sent. */
  protected revise(): void {
    const quotation = this.quotation();
    if (!quotation) return;
    this.confirmation.confirm({
      header: 'Revisar cotización',
      message:
        'Se crea un borrador nuevo con las mismas partidas y precios de hoy, y esta se cancela. La liga que ya tiene el cliente seguirá mostrando lo que se le envió.',
      acceptLabel: 'Crear revisión',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'btn-primary',
      rejectButtonStyleClass: 'btn-neutral',
      accept: () => {
        this.store.dispatch(new ReviseQuotation(quotation.id)).subscribe({
          next: () => {
            const revision = this.quotation();
            this.messages.add({ severity: 'success', summary: 'Revisión creada' });
            if (revision) this.router.navigate(['/quotations', revision.id]);
          },
          error: (err) =>
            this.messages.add({
              severity: 'error',
              summary: 'No se pudo revisar',
              detail: errorMessage(err, 'Inténtalo de nuevo.'),
            }),
        });
      },
    });
  }

  protected remind(contactId: string): void {
    const quotation = this.quotation();
    if (!quotation || this.remindingId()) return;
    this.remindingId.set(contactId);
    this.quotationsService.remind(quotation.id, contactId).subscribe({
      next: ({ email }) => {
        this.remindingId.set(null);
        this.messages.add({ severity: 'success', summary: `Recordatorio enviado a ${email}` });
        this.store.dispatch(new LoadQuotationTimeline(quotation.id));
      },
      error: (err) => {
        this.remindingId.set(null);
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo enviar el recordatorio',
          detail: errorMessage(err, 'Inténtalo de nuevo.'),
        });
      },
    });
  }

  private reload(id: string): void {
    this.store.dispatch(new LoadQuotationDetail(id));
    this.store.dispatch(new LoadQuotationTimeline(id));
  }
}

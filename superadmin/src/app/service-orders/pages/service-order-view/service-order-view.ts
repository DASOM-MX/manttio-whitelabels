import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { MessageService } from 'primeng/api';
import {
  LucideCalendarPlus,
  LucideCheck,
  LucideCopy,
  LucideDynamicIcon,
  LucideFilePlus,
  LucideFileText,
  LucideFlag,
  LucidePencil,
  LucideRotateCcw,
  LucideSearchX,
  LucideX,
} from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { ServiceOrdersState } from '../../../../state/service-orders/service-orders.state';
import {
  LoadServiceOrderDetail,
  LoadServiceOrderReports,
  LoadServiceOrderTimeline,
  SetServiceOrderStatus,
  UpdateServiceOrder,
} from '../../../../state/service-orders/service-orders.actions';
import { AuthState } from '../../../../state/auth/auth.state';
import { hasRole } from '../../../guards/has-role.guard';
import { ServiceOrderStatus } from '../../../model/enums/service-order/service-order-status.enum';
import { ServiceOrderPriority } from '../../../model/enums/service-order/service-order-priority.enum';
import { ReportStatus } from '../../../model/enums/report/report-status.enum';
import { SERVICE_ORDER_PRIORITY_LABELS } from '../../../model/constants/service-order/service-order-priority-labels.const';
import {
  ServiceOrderEventChipClassPipe,
  ServiceOrderEventIconPipe,
  ServiceOrderEventLabelPipe,
  ServiceOrderPriorityFlagClassPipe,
  ServiceOrderPriorityLabelClassPipe,
  ServiceOrderPriorityLabelPipe,
  ServiceOrderStatusLabelPipe,
  ServiceOrderStatusSeverityPipe,
} from '../../../pipes/service-order.pipe';
import { ReportStatusLabelPipe, ReportStatusSeverityPipe } from '../../../pipes/report-status.pipe';
import { MoneyPipe } from '../../../pipes/money.pipe';
import { ServiceTaxRateShortPipe } from '../../../pipes/service-tax-rate.pipe';
import { RelativeTimePipe } from '../../../pipes/relative-time.pipe';
import { ServiceUomShortPipe } from '../../../pipes/service-uom.pipe';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { VisitDialog } from '../../../calendar/components/visit-dialog/visit-dialog';
import { ServiceOrderContractsCard } from '../../../contracts/components/service-order-contracts-card/service-order-contracts-card';
import { errorCode, errorMessage, isCalendarDatePast, toCalendarDate } from '../../../data/utils';
import type { ServiceOrderReport } from '../../../data/dtos/service-order';

/** Order view (19 §5): header with folio + status actions, lines card,
 *  lazy-loaded exploded-reports card, and the activity timeline (§7 — the
 *  newest-first feed the CP-5 handoff document will be composed from).
 *  Visits schedule from here via **Programar visita** (19 CP-3 — the dialog
 *  opens with this order locked) and their lifecycle shows in the timeline;
 *  the week view lives in the calendar. **Generar contrato** files a document
 *  against this job (13 §2 — an order generates 0..n) and the Contratos card
 *  lists what it produced; filing rides the same open-order gate as every other
 *  mutation here (owner 2026-08-22), so a closed or cancelled job is done
 *  growing.
 *
 *  Mutability mirrors the API (19 §1): comments for any staff, location for
 *  owner/admin only, status one-way with a confirm dialog — cancel warns that
 *  unfinished reports are voided and carries the optional motivo. */
@Component({
  selector: 'app-service-order-view',
  imports: [
    DatePipe,
    RouterLink,
    ReactiveFormsModule,
    TableModule,
    TabsModule,
    TagModule,
    DialogModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    DatePickerModule,
    ServiceOrderStatusLabelPipe,
    ServiceOrderStatusSeverityPipe,
    ServiceOrderPriorityFlagClassPipe,
    ServiceOrderPriorityLabelClassPipe,
    ServiceOrderPriorityLabelPipe,
    ServiceOrderEventChipClassPipe,
    ServiceOrderEventIconPipe,
    ServiceOrderEventLabelPipe,
      ReportStatusLabelPipe,
    ReportStatusSeverityPipe,
    MoneyPipe,
    ServiceTaxRateShortPipe,
    RelativeTimePipe,
    ServiceUomShortPipe,
    PageHeader,
    VisitDialog,
    ServiceOrderContractsCard,
    LucideCalendarPlus,
    LucideCheck,
    LucideCopy,
    LucideDynamicIcon,
    LucideFilePlus,
    LucideFileText,
    LucideFlag,
    LucidePencil,
    LucideRotateCcw,
    LucideSearchX,
    LucideX,
  ],
  templateUrl: './service-order-view.html',
})
export class ServiceOrderView {
  private fb = inject(FormBuilder);
  private store = inject(Store);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private messages = inject(MessageService);

  protected order = select(ServiceOrdersState.selected);
  protected loadFailed = select(ServiceOrdersState.selectedError);
  protected reports = select(ServiceOrdersState.reports);
  protected timeline = select(ServiceOrdersState.timeline);
  protected timelineTotal = select(ServiceOrdersState.timelineTotal);
  private me = select(AuthState.me);

  protected isStaff = computed(() => hasRole(this.me(), ['owner', 'admin', 'office']));
  protected canEditLocation = computed(() => hasRole(this.me(), ['owner', 'admin']));
  protected isOpen = computed(() => this.order()?.status === ServiceOrderStatus.Open);
  /** Reopen is the owner/admin safety valve for a fat-fingered Completar
   *  (CP-2b) — completed orders only; cancelled is terminal. */
  protected canReopen = computed(
    () =>
      hasRole(this.me(), ['owner', 'admin']) &&
      this.order()?.status === ServiceOrderStatus.Completed,
  );
  protected showsMoney = computed(() => this.order()?.amounts !== undefined);
  protected hasMoreEvents = computed(() => this.timeline().length < this.timelineTotal());

  protected isUrgent = computed(() => this.order()?.priority === ServiceOrderPriority.Urgent);
  protected isOverdue = computed(() => {
    const order = this.order();
    return (
      order?.status === ServiceOrderStatus.Open &&
      !!order.promisedDate &&
      isCalendarDatePast(order.promisedDate)
    );
  });
  /** Header progress chip (CP-2b) — hidden while the order has no live
   *  reports at all (every unit voided by a cancel). */
  protected progressChip = computed(() => {
    const order = this.order();
    return order && order.reportsTotal > 0
      ? `Avance ${order.reportsFinished}/${order.reportsTotal}`
      : '';
  });
  /** The Completar warning (CP-2b): how many live reports aren't finished yet.
   *  Empty while the lazy reports read is still in flight — the confirm just
   *  shows no warning rather than a wrong number. */
  protected unfinishedWarning = computed(() => {
    const pending = (this.reports() ?? []).filter(
      (r) =>
        r.status !== ReportStatus.Finished &&
        r.status !== ReportStatus.Mailed &&
        r.status !== ReportStatus.Cancelled,
    ).length;
    if (pending === 0) return '';
    return pending === 1
      ? 'Queda 1 reporte sin terminar.'
      : `Quedan ${pending} reportes sin terminar.`;
  });

  /** Which detail tab is showing — the activity feed lives in its own tab
   *  (owner 2026-07-27), mirroring the customer-view idiom. */
  protected activeTab = signal('general');

  protected saving = signal(false);
  protected editOpen = signal(false);
  protected cancelOpen = signal(false);
  protected completeOpen = signal(false);
  protected reopenOpen = signal(false);
  private timelinePage = signal(1);

  protected editForm = this.fb.nonNullable.group({
    comments: [''],
    location: [''],
    priority: [ServiceOrderPriority.Normal],
    promisedDate: this.fb.control<Date | null>(null),
  });
  protected cancelNote = this.fb.nonNullable.control('');
  protected reopenNote = this.fb.nonNullable.control('');

  protected priorityOptions = (
    Object.entries(SERVICE_ORDER_PRIORITY_LABELS) as [ServiceOrderPriority, string][]
  ).map(([value, label]) => ({ label, value }));

  private id = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });

  constructor() {
    const id = this.orderId();
    this.store.dispatch(new LoadServiceOrderDetail(id));
    this.store.dispatch(new LoadServiceOrderReports(id));
    this.store.dispatch(new LoadServiceOrderTimeline(id, 1));
  }

  private orderId(): string {
    return this.id().get('id') ?? '';
  }

  /** p-tabs emits `string | number | undefined` — normalize to our tab keys. */
  protected setTab(value: string | number | undefined): void {
    this.activeTab.set(String(value ?? 'general'));
  }

  protected loadMoreEvents(): void {
    const next = this.timelinePage() + 1;
    this.timelinePage.set(next);
    this.store.dispatch(new LoadServiceOrderTimeline(this.orderId(), next, true));
  }

  protected openReport(report: ServiceOrderReport): void {
    void this.router.navigate(['/reports', report.id]);
  }

  protected visitDialog = viewChild<VisitDialog>('visitDialog');

  /** Programar visita (19 CP-3 — plan 12's CP-3 is the *field app*): the
   *  dialog opens with this order locked — the client derives from it, no
   *  order select to get wrong. */
  protected scheduleVisit(): void {
    const order = this.order();
    if (!order) return;
    this.visitDialog()?.openCreate({
      id: order.id,
      folio: order.folio,
      customerId: order.customerId,
      customerName: order.customerName,
    });
  }

  /** Visit mutations audit to THIS order's timeline — refresh the feed. */
  protected onVisitChanged(): void {
    this.refreshTimeline();
  }

  protected openEdit(): void {
    const order = this.order();
    if (!order) return;
    this.editForm.reset({
      comments: order.comments ?? '',
      location: order.location ?? '',
      priority: order.priority,
      // Local-midnight parse — `new Date('YYYY-MM-DD')` alone would read as UTC
      // and show the previous day west of Greenwich.
      promisedDate: order.promisedDate ? new Date(`${order.promisedDate}T00:00:00`) : null,
    });
    this.editOpen.set(true);
  }

  protected saveEdit(): void {
    if (this.saving()) return;
    this.saving.set(true);
    const value = this.editForm.getRawValue();
    const payload = {
      comments: value.comments,
      priority: value.priority,
      // null withdraws the promise (CP-2b).
      promisedDate: value.promisedDate ? toCalendarDate(value.promisedDate) : null,
      ...(this.canEditLocation() ? { location: value.location } : {}),
    };
    this.store.dispatch(new UpdateServiceOrder(this.orderId(), payload)).subscribe({
      next: () => {
        this.saving.set(false);
        this.editOpen.set(false);
        this.refreshTimeline();
      },
      error: (err) => {
        this.saving.set(false);
        this.toastError('No se pudo guardar', err);
        this.resyncIfClosed(err);
      },
    });
  }

  protected confirmComplete(): void {
    this.setStatus(ServiceOrderStatus.Completed);
  }

  protected confirmCancel(): void {
    this.setStatus(ServiceOrderStatus.Cancelled, this.cancelNote.value || undefined);
  }

  /** The CP-2b reopen — `open` as a status target, owner/admin only. */
  protected confirmReopen(): void {
    this.setStatus(ServiceOrderStatus.Open, this.reopenNote.value || undefined);
  }

  protected duplicate(): void {
    // Frontend-only Duplicar (CP-2b): the builder prefills from the source
    // order — client, location, comments and lines; never technicians or
    // report types (explosion inputs, stale by design).
    void this.router.navigate(['/service-orders/new'], {
      queryParams: { from: this.orderId() },
    });
  }

  private setStatus(status: ServiceOrderStatus, note?: string): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.store.dispatch(new SetServiceOrderStatus(this.orderId(), { status, note })).subscribe({
      next: () => {
        this.saving.set(false);
        this.completeOpen.set(false);
        this.cancelOpen.set(false);
        this.reopenOpen.set(false);
        // The status move rewrote children (a cancel voids unfinished
        // reports) — refetch what the cards show.
        this.store.dispatch(new LoadServiceOrderReports(this.orderId()));
        this.refreshTimeline();
      },
      error: (err) => {
        this.saving.set(false);
        this.toastError('No se pudo cambiar el estado', err);
        this.resyncIfClosed(err);
      },
    });
  }

  /** The backend refuses every mutation on a closed order (409 `order_closed`
   *  on PATCH, `invalid_status_transition` on a second status move — decided
   *  2026-07-29). Landing on one here means this tab is stale: someone closed
   *  the order after it loaded. The action can never succeed, so drop the
   *  dialogs and reload the detail — the fresh status hides the action buttons. */
  private resyncIfClosed(err: unknown): void {
    const code = errorCode(err);
    if (code !== 'order_closed' && code !== 'invalid_status_transition') return;
    this.editOpen.set(false);
    this.completeOpen.set(false);
    this.cancelOpen.set(false);
    this.reopenOpen.set(false);
    this.store.dispatch(new LoadServiceOrderDetail(this.orderId()));
  }

  private refreshTimeline(): void {
    this.timelinePage.set(1);
    this.store.dispatch(new LoadServiceOrderTimeline(this.orderId(), 1));
  }

  private toastError(summary: string, err: unknown): void {
    this.messages.add({ severity: 'error', summary, detail: errorMessage(err, 'Inténtalo de nuevo.') });
  }
}

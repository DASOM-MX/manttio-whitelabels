import { Component, computed, inject, signal } from '@angular/core';
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
import { MessageService } from 'primeng/api';
import {
  LucideCheck,
  LucideDynamicIcon,
  LucideFileText,
  LucidePencil,
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
import {
  ServiceOrderEventChipClassPipe,
  ServiceOrderEventIconPipe,
  ServiceOrderEventLabelPipe,
  ServiceOrderStatusLabelPipe,
  ServiceOrderStatusSeverityPipe,
  ReportTypeLabelPipe,
} from '../../../pipes/service-order.pipe';
import { ReportStatusLabelPipe, ReportStatusSeverityPipe } from '../../../pipes/report-status.pipe';
import { MoneyPipe } from '../../../pipes/money.pipe';
import { ServiceTaxRateShortPipe } from '../../../pipes/service-tax-rate.pipe';
import { RelativeTimePipe } from '../../../pipes/relative-time.pipe';
import { ServiceUomShortPipe } from '../../../pipes/service-uom.pipe';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { errorMessage } from '../../../data/utils';
import type { ServiceOrderReport } from '../../../data/dtos/service-order';

/** Order view (19 §5): header with folio + status actions, lines card,
 *  lazy-loaded exploded-reports card, and the activity timeline (§7 — the
 *  newest-first feed the CP-5 handoff document will be composed from). The
 *  visits card arrives with CP-3; the contracts card with 13's backend.
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
    ServiceOrderStatusLabelPipe,
    ServiceOrderStatusSeverityPipe,
    ServiceOrderEventChipClassPipe,
    ServiceOrderEventIconPipe,
    ServiceOrderEventLabelPipe,
    ReportTypeLabelPipe,
    ReportStatusLabelPipe,
    ReportStatusSeverityPipe,
    MoneyPipe,
    ServiceTaxRateShortPipe,
    RelativeTimePipe,
    ServiceUomShortPipe,
    PageHeader,
    LucideCheck,
    LucideDynamicIcon,
    LucideFileText,
    LucidePencil,
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
  protected showsMoney = computed(() => this.order()?.amounts !== undefined);
  protected hasMoreEvents = computed(() => this.timeline().length < this.timelineTotal());

  /** Which detail tab is showing — the activity feed lives in its own tab
   *  (owner 2026-07-27), mirroring the customer-view idiom. */
  protected activeTab = signal('general');

  protected saving = signal(false);
  protected editOpen = signal(false);
  protected cancelOpen = signal(false);
  protected completeOpen = signal(false);
  private timelinePage = signal(1);

  protected editForm = this.fb.nonNullable.group({ comments: [''], location: [''] });
  protected cancelNote = this.fb.nonNullable.control('');

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

  protected openEdit(): void {
    const order = this.order();
    if (!order) return;
    this.editForm.reset({ comments: order.comments ?? '', location: order.location ?? '' });
    this.editOpen.set(true);
  }

  protected saveEdit(): void {
    if (this.saving()) return;
    this.saving.set(true);
    const value = this.editForm.getRawValue();
    const payload = this.canEditLocation()
      ? { comments: value.comments, location: value.location }
      : { comments: value.comments };
    this.store.dispatch(new UpdateServiceOrder(this.orderId(), payload)).subscribe({
      next: () => {
        this.saving.set(false);
        this.editOpen.set(false);
        this.refreshTimeline();
      },
      error: (err) => {
        this.saving.set(false);
        this.toastError('No se pudo guardar', err);
      },
    });
  }

  protected confirmComplete(): void {
    this.setStatus(ServiceOrderStatus.Completed);
  }

  protected confirmCancel(): void {
    this.setStatus(ServiceOrderStatus.Cancelled, this.cancelNote.value || undefined);
  }

  private setStatus(
    status: ServiceOrderStatus.Completed | ServiceOrderStatus.Cancelled,
    note?: string,
  ): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.store.dispatch(new SetServiceOrderStatus(this.orderId(), { status, note })).subscribe({
      next: () => {
        this.saving.set(false);
        this.completeOpen.set(false);
        this.cancelOpen.set(false);
        // The status move rewrote children (a cancel voids unfinished
        // reports) — refetch what the cards show.
        this.store.dispatch(new LoadServiceOrderReports(this.orderId()));
        this.refreshTimeline();
      },
      error: (err) => {
        this.saving.set(false);
        this.toastError('No se pudo cambiar el estado', err);
      },
    });
  }

  private refreshTimeline(): void {
    this.timelinePage.set(1);
    this.store.dispatch(new LoadServiceOrderTimeline(this.orderId(), 1));
  }

  private toastError(summary: string, err: unknown): void {
    this.messages.add({ severity: 'error', summary, detail: errorMessage(err, 'Inténtalo de nuevo.') });
  }
}

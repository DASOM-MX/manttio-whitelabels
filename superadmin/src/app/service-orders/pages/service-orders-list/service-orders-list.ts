import { Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { LucideClipboardList, LucidePlus } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { ServiceOrdersState } from '../../../../state/service-orders/service-orders.state';
import { LoadServiceOrders } from '../../../../state/service-orders/service-orders.actions';
import { AuthState } from '../../../../state/auth/auth.state';
import { ListQueryService, keyIn } from '../../../services/table/list-query.service';
import { hasRole } from '../../../guards/has-role.guard';
import { SERVICE_ORDER_STATUS_LABELS } from '../../../model/constants/service-order/service-order-status-labels.const';
import { SERVICE_ORDER_PRIORITY_LABELS } from '../../../model/constants/service-order/service-order-priority-labels.const';
import {
  ServiceOrderStatusLabelPipe,
  ServiceOrderStatusSeverityPipe,
} from '../../../pipes/service-order.pipe';
import { MoneyPipe } from '../../../pipes/money.pipe';
import { FiltersPopover } from '../../../shared/components/filters-popover/filters-popover';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { isCalendarDatePast } from '../../../data/utils';
import type { ServiceOrder, ServiceOrderListQuery } from '../../../data/dtos/service-order';
import { ServiceOrderPriority } from '../../../model/enums/service-order/service-order-priority.enum';
import { ServiceOrderStatus } from '../../../model/enums/service-order/service-order-status.enum';

/** Service orders list (19 §5): lazy server-side p-table — folio, cliente,
 *  servicios count, status pill, total, fecha — with `q`/`status` in the
 *  filters popover and `customerId` accepted as a URL param (the customer-view
 *  card navigates here pre-filtered; there is deliberately no picker for it).
 *
 *  Technicians reach orders through their assigned reports, not the nav — but
 *  the route stays open to them (19 §3): money renders as an em dash (the API
 *  omits it) and "Nueva orden" is staff-only. */
@Component({
  selector: 'app-service-orders-list',
  imports: [
    DatePipe,
    RouterLink,
    ReactiveFormsModule,
    TableModule,
    SelectModule,
    InputTextModule,
    TagModule,
    ServiceOrderStatusLabelPipe,
    ServiceOrderStatusSeverityPipe,
    MoneyPipe,
    FiltersPopover,
    PageHeader,
    LucideClipboardList,
    LucidePlus,
  ],
  providers: [ListQueryService],
  templateUrl: './service-orders-list.html',
})
export class ServiceOrdersList {
  private store = inject(Store);
  private router = inject(Router);
  protected list = inject(ListQueryService);

  protected orders = select(ServiceOrdersState.items);
  protected total = select(ServiceOrdersState.total);
  protected loading = select(ServiceOrdersState.loading);
  private me = select(AuthState.me);

  protected canCreate = computed(() => hasRole(this.me(), ['owner', 'admin', 'office']));
  /** The API strips money for technicians — drop the column instead of
   *  rendering a dash ladder. */
  protected showsMoney = computed(() => this.orders().some((o) => o.amounts !== undefined));

  /** Per-row dispatch decorations (CP-2b), resolved once per load so the
   *  template reads plain fields: the Urgente/Vencida tags and the Avance
   *  column (`—` when the order has no live reports at all). */
  protected rows = computed(() =>
    this.orders().map((order) => ({
      ...order,
      urgent: order.priority === ServiceOrderPriority.Urgent,
      overdue:
        order.status === ServiceOrderStatus.Open &&
        !!order.promisedDate &&
        isCalendarDatePast(order.promisedDate),
      progress:
        order.reportsTotal > 0 ? `${order.reportsFinished}/${order.reportsTotal}` : '—',
    })),
  );

  protected search = new FormControl('', { nonNullable: true });
  protected statusFilter = new FormControl<ServiceOrderStatus | ''>('', { nonNullable: true });
  protected priorityFilter = new FormControl<ServiceOrderPriority | ''>('', { nonNullable: true });
  /** '' | 'true' — mirrors the URL param; only 'true' filters. */
  protected overdueFilter = new FormControl<'' | 'true'>('', { nonNullable: true });
  /** URL-only filter — set when a customer card links here. */
  private customerId: string | undefined;

  protected statusOptions = [
    { label: 'Todos los estados', value: '' },
    ...(Object.entries(SERVICE_ORDER_STATUS_LABELS) as [ServiceOrderStatus, string][]).map(
      ([value, label]) => ({ label, value }),
    ),
  ];

  protected priorityOptions = [
    { label: 'Todas las prioridades', value: '' },
    ...(Object.entries(SERVICE_ORDER_PRIORITY_LABELS) as [ServiceOrderPriority, string][]).map(
      ([value, label]) => ({ label, value }),
    ),
  ];

  protected overdueOptions = [
    { label: 'Todas', value: '' },
    { label: 'Solo vencidas', value: 'true' },
  ];

  protected readonly skeletonRows = [0, 1, 2, 3, 4, 5, 6, 7];

  constructor() {
    this.list.init({
      read: (params) => {
        this.search.setValue(params.get('q') ?? '', { emitEvent: false });
        this.statusFilter.setValue(keyIn(SERVICE_ORDER_STATUS_LABELS, params.get('status')), {
          emitEvent: false,
        });
        this.priorityFilter.setValue(
          keyIn(SERVICE_ORDER_PRIORITY_LABELS, params.get('priority')),
          { emitEvent: false },
        );
        this.overdueFilter.setValue(params.get('overdue') === 'true' ? 'true' : '', {
          emitEvent: false,
        });
        this.customerId = params.get('customer') ?? undefined;
      },
      write: () => ({
        q: this.search.value || null,
        status: this.statusFilter.value || null,
        priority: this.priorityFilter.value || null,
        overdue: this.overdueFilter.value || null,
        customer: this.customerId ?? null,
      }),
      load: (page) => this.store.dispatch(new LoadServiceOrders(this.query(page))),
    });
    this.list.bindFilters({
      debounced: [this.search],
      instant: [this.statusFilter, this.priorityFilter, this.overdueFilter],
    });
  }

  private query(page: number): ServiceOrderListQuery {
    return {
      page,
      limit: this.list.PAGE_SIZE,
      q: this.search.value || undefined,
      status: this.statusFilter.value || undefined,
      priority: this.priorityFilter.value || undefined,
      overdue: this.overdueFilter.value === 'true' || undefined,
      customerId: this.customerId,
    };
  }

  protected openOrder(order: ServiceOrder): void {
    void this.router.navigate(['/service-orders', order.id]);
  }
}

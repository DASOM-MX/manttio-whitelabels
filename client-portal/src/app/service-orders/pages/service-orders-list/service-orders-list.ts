import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { LucideWrench } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { ServiceOrdersState } from '../../../../state/service-orders/service-orders.state';
import { ServiceOrdersLoadList } from '../../../../state/service-orders/service-orders.actions';
import { ListQueryService, keyIn } from '../../../services/table/list-query.service';
import { tableLoading } from '../../../services/table/table-loading';
import { SERVICE_ORDER_STATUS_LABELS } from '../../../model/constants/service-order/service-order-status-labels.const';
import {
  ServiceOrderStatusLabelPipe,
  ServiceOrderStatusSeverityPipe,
} from '../../../pipes/service-order-status.pipe';
import { FiltersPopover } from '../../../shared/components/filters-popover/filters-popover';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import type { PortalServiceOrderListItem } from '../../../data/dtos/portal-service-order/portal-service-order-list-item.dto';
import type { PortalServiceOrdersQuery } from '../../../data/dtos/portal-service-order/portal-service-orders-query.dto';
import type { ServiceOrderStatus } from '../../../model/enums/service-order/service-order-status.enum';

/** Órdenes de servicio (04 §6): server-paginated list, filters + page
 *  persisted in the URL — the same `ListQueryService` idiom the rest of the
 *  portal uses. No priority column (A15) — it is an internal dispatch
 *  signal. The backend scopes rows to the token's customer and to
 *  `open`/`completed` only (A7). */
@Component({
  selector: 'app-service-orders-list',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    TableModule,
    SelectModule,
    InputTextModule,
    TagModule,
    ServiceOrderStatusLabelPipe,
    ServiceOrderStatusSeverityPipe,
    FiltersPopover,
    PageHeader,
    LucideWrench,
  ],
  providers: [ListQueryService],
  templateUrl: './service-orders-list.html',
})
export class ServiceOrdersList {
  private readonly store = inject(Store);
  private readonly router = inject(Router);
  protected readonly list = inject(ListQueryService);

  protected orders = select(ServiceOrdersState.items);
  protected total = select(ServiceOrdersState.total);
  protected loading = select(ServiceOrdersState.loading);
  protected tableBusy = tableLoading(this.loading, this.orders);

  protected search = new FormControl('', { nonNullable: true });
  protected statusFilter = new FormControl<ServiceOrderStatus | ''>('', { nonNullable: true });

  protected statusOptions = [
    { label: 'Todos los estados', value: '' },
    ...(Object.entries(SERVICE_ORDER_STATUS_LABELS) as [ServiceOrderStatus, string][])
      // `cancelled` never reaches the portal (A7) — offering it would filter
      // to an always-empty result.
      .filter(([value]) => value !== 'cancelled')
      .map(([value, label]) => ({ label, value })),
  ];

  /** Distinguishes the empty states (04 §1): "nothing here yet" vs "nothing
   *  matches your filters". Set from the URL params directly, so it stays
   *  correct on the very first paint. */
  protected hasFilters = signal(false);

  constructor() {
    this.list.init({
      read: (params) => {
        this.search.setValue(params.get('q') ?? '', { emitEvent: false });
        this.statusFilter.setValue(keyIn(SERVICE_ORDER_STATUS_LABELS, params.get('status')), {
          emitEvent: false,
        });
        this.hasFilters.set(!!params.get('q') || !!params.get('status'));
      },
      write: () => ({
        q: this.search.value || null,
        status: this.statusFilter.value || null,
      }),
      load: (page) => this.store.dispatch(new ServiceOrdersLoadList(this.query(page))),
    });
    this.list.bindFilters({
      debounced: [this.search],
      instant: [this.statusFilter],
    });
  }

  private query(page: number): PortalServiceOrdersQuery {
    return {
      page,
      limit: this.list.PAGE_SIZE,
      search: this.search.value || undefined,
      status: this.statusFilter.value || undefined,
    };
  }

  protected openOrder(order: PortalServiceOrderListItem): void {
    this.router.navigate(['/service-orders', order.id]);
  }
}

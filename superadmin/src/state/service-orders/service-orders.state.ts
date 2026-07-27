import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { catchError, tap } from 'rxjs';
import { ServiceOrdersService } from '../../app/services/http/service-orders.service';
import {
  CreateServiceOrder,
  LoadServiceOrderDetail,
  LoadServiceOrderReports,
  LoadServiceOrderTimeline,
  LoadServiceOrders,
  SetServiceOrderStatus,
  UpdateServiceOrder,
} from './service-orders.actions';
import type {
  ServiceOrder,
  ServiceOrderDetail,
  ServiceOrderEvent,
  ServiceOrderListQuery,
  ServiceOrderReport,
} from '../../app/data/dtos/service-order';

/** Feed page size — the CRM timeline's, not the tables' 10: a feed row is one
 *  line, a "Ver más" that adds ten of them barely moves the scroll. */
const TIMELINE_PAGE_SIZE = 10;

export interface ServiceOrdersStateModel {
  items: ServiceOrder[];
  total: number;
  loading: boolean;
  selected: ServiceOrderDetail | null;
  selectedError: boolean;
  /** Lazy order-view slices (19 §4): `null` = not yet requested, so the cards
   *  can tell "loading" apart from "loaded empty". */
  reports: ServiceOrderReport[] | null;
  timeline: ServiceOrderEvent[];
  timelineTotal: number;
  query: ServiceOrderListQuery;
}

@State<ServiceOrdersStateModel>({
  name: 'serviceOrders',
  defaults: {
    items: [],
    total: 0,
    loading: false,
    selected: null,
    selectedError: false,
    reports: null,
    timeline: [],
    timelineTotal: 0,
    query: {},
  },
})
@Injectable()
export class ServiceOrdersState {
  private readonly api = inject(ServiceOrdersService);

  @Selector() static items(s: ServiceOrdersStateModel): ServiceOrder[] {
    return s.items;
  }
  @Selector() static total(s: ServiceOrdersStateModel): number {
    return s.total;
  }
  @Selector() static loading(s: ServiceOrdersStateModel): boolean {
    return s.loading;
  }
  @Selector() static selected(s: ServiceOrdersStateModel): ServiceOrderDetail | null {
    return s.selected;
  }
  @Selector() static selectedError(s: ServiceOrdersStateModel): boolean {
    return s.selectedError;
  }
  @Selector() static reports(s: ServiceOrdersStateModel): ServiceOrderReport[] | null {
    return s.reports;
  }
  @Selector() static timeline(s: ServiceOrdersStateModel): ServiceOrderEvent[] {
    return s.timeline;
  }
  @Selector() static timelineTotal(s: ServiceOrdersStateModel): number {
    return s.timelineTotal;
  }

  @Action(LoadServiceOrders)
  load(ctx: StateContext<ServiceOrdersStateModel>, { query }: LoadServiceOrders) {
    ctx.patchState({ loading: true, query });
    return this.api.list(query).pipe(
      tap(({ items, total }) => ctx.patchState({ items, total, loading: false })),
      catchError((err) => {
        ctx.patchState({ loading: false });
        throw err;
      }),
    );
  }

  /** Detail navigation resets the lazy slices — a stale reports card from the
   *  previous order must never flash under the new header. */
  @Action(LoadServiceOrderDetail)
  loadDetail(ctx: StateContext<ServiceOrdersStateModel>, { id }: LoadServiceOrderDetail) {
    ctx.patchState({
      selected: null,
      selectedError: false,
      reports: null,
      timeline: [],
      timelineTotal: 0,
    });
    return this.api.get(id).pipe(
      tap(({ order }) => ctx.patchState({ selected: order })),
      catchError((err) => {
        ctx.patchState({ selectedError: true });
        throw err;
      }),
    );
  }

  @Action(LoadServiceOrderReports)
  loadReports(ctx: StateContext<ServiceOrdersStateModel>, { id }: LoadServiceOrderReports) {
    return this.api
      .reports(id)
      .pipe(tap(({ reports }) => ctx.patchState({ reports })));
  }

  @Action(LoadServiceOrderTimeline)
  loadTimeline(
    ctx: StateContext<ServiceOrdersStateModel>,
    { id, page, append }: LoadServiceOrderTimeline,
  ) {
    return this.api.timeline(id, page, TIMELINE_PAGE_SIZE).pipe(
      tap(({ items, total }) =>
        ctx.patchState({
          timeline: append ? [...ctx.getState().timeline, ...items] : items,
          timelineTotal: total,
        }),
      ),
    );
  }

  /** The builder navigates straight to the created order — hold it as
   *  `selected` so the view renders without a second GET. */
  @Action(CreateServiceOrder)
  create(ctx: StateContext<ServiceOrdersStateModel>, { payload }: CreateServiceOrder) {
    return this.api
      .create(payload)
      .pipe(tap(({ order }) => ctx.patchState({ selected: order, selectedError: false })));
  }

  @Action(UpdateServiceOrder)
  update(ctx: StateContext<ServiceOrdersStateModel>, { id, payload }: UpdateServiceOrder) {
    return this.api.update(id, payload).pipe(tap(({ order }) => ctx.patchState({ selected: order })));
  }

  /** Status moves rewrite child reports (a cancel voids the unfinished ones),
   *  so the lazy slices reset — the view refetches what it shows. */
  @Action(SetServiceOrderStatus)
  setStatus(ctx: StateContext<ServiceOrdersStateModel>, { id, payload }: SetServiceOrderStatus) {
    return this.api.setStatus(id, payload).pipe(
      tap(({ order }) =>
        ctx.patchState({ selected: order, reports: null, timeline: [], timelineTotal: 0 }),
      ),
    );
  }
}

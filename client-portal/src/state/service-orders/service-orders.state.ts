import { Injectable, inject } from '@angular/core';
import { Action, Selector, State, StateContext } from '@ngxs/store';
import { catchError, tap } from 'rxjs';
import { PortalServiceOrdersService } from '../../app/services/http/portal-service-orders.service';
import { ServiceOrdersLoadList, ServiceOrdersLoadOne } from './service-orders.actions';
import { errorMessage } from '../../app/data/utils';
import type { PortalServiceOrderDetail } from '../../app/data/dtos/portal-service-order/portal-service-order-detail.dto';
import type { PortalServiceOrderListItem } from '../../app/data/dtos/portal-service-order/portal-service-order-list-item.dto';

export interface ServiceOrdersStateModel {
  items: PortalServiceOrderListItem[];
  total: number;
  loading: boolean;
  error: string | null;
  selected: PortalServiceOrderDetail | null;
  selectedLoading: boolean;
  selectedError: string | null;
}

/** Órdenes de servicio (04 §6): list + detail, scoped server-side to the
 *  token's customer and to `open`/`completed` rows only (A7). */
@State<ServiceOrdersStateModel>({
  name: 'serviceOrders',
  defaults: {
    items: [],
    total: 0,
    loading: false,
    error: null,
    selected: null,
    selectedLoading: false,
    selectedError: null,
  },
})
@Injectable()
export class ServiceOrdersState {
  private readonly api = inject(PortalServiceOrdersService);

  @Selector() static items(s: ServiceOrdersStateModel): PortalServiceOrderListItem[] {
    return s.items;
  }
  @Selector() static total(s: ServiceOrdersStateModel): number {
    return s.total;
  }
  @Selector() static loading(s: ServiceOrdersStateModel): boolean {
    return s.loading;
  }
  @Selector() static error(s: ServiceOrdersStateModel): string | null {
    return s.error;
  }
  @Selector() static selected(s: ServiceOrdersStateModel): PortalServiceOrderDetail | null {
    return s.selected;
  }
  @Selector() static selectedLoading(s: ServiceOrdersStateModel): boolean {
    return s.selectedLoading;
  }
  @Selector() static selectedError(s: ServiceOrdersStateModel): string | null {
    return s.selectedError;
  }

  @Action(ServiceOrdersLoadList)
  loadList(ctx: StateContext<ServiceOrdersStateModel>, { query }: ServiceOrdersLoadList) {
    ctx.patchState({ loading: true, error: null });
    return this.api.list(query).pipe(
      tap(({ items, total }) => ctx.patchState({ items, total, loading: false })),
      catchError((err) => {
        ctx.patchState({
          loading: false,
          error: errorMessage(err, 'No se pudieron cargar las órdenes de servicio.'),
        });
        throw err;
      }),
    );
  }

  @Action(ServiceOrdersLoadOne)
  loadOne(ctx: StateContext<ServiceOrdersStateModel>, { id }: ServiceOrdersLoadOne) {
    ctx.patchState({ selected: null, selectedLoading: true, selectedError: null });
    return this.api.get(id).pipe(
      tap((order) => ctx.patchState({ selected: order, selectedLoading: false })),
      catchError((err) => {
        ctx.patchState({
          selectedLoading: false,
          selectedError: errorMessage(err, 'No pudimos encontrar esta orden de servicio.'),
        });
        throw err;
      }),
    );
  }
}

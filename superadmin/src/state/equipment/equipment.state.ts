import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { catchError, tap } from 'rxjs';
import { EquipmentService } from '../../app/services/http/equipment.service';
import {
  CreateEquipment,
  DeleteEquipment,
  LinkReport,
  LoadCustomerEquipment,
  LoadEquipment,
  LoadEquipmentDetail,
  SetEquipmentStatus,
  UnlinkReport,
  UpdateEquipment,
} from './equipment.actions';
import type { Equipment, EquipmentListQuery } from '../../app/data/dtos/equipment';

export interface EquipmentStateModel {
  items: Equipment[];
  total: number;
  loading: boolean;
  selected: Equipment | null;
  /** Customer-view card data. */
  byCustomer: Equipment[];
  query: EquipmentListQuery;
}

@State<EquipmentStateModel>({
  name: 'equipment',
  defaults: { items: [], total: 0, loading: false, selected: null, byCustomer: [], query: {} },
})
@Injectable()
export class EquipmentState {
  private readonly api = inject(EquipmentService);

  @Selector() static items(s: EquipmentStateModel): Equipment[] {
    return s.items;
  }
  @Selector() static total(s: EquipmentStateModel): number {
    return s.total;
  }
  @Selector() static loading(s: EquipmentStateModel): boolean {
    return s.loading;
  }
  @Selector() static selected(s: EquipmentStateModel): Equipment | null {
    return s.selected;
  }
  @Selector() static byCustomer(s: EquipmentStateModel): Equipment[] {
    return s.byCustomer;
  }

  private applySelected(ctx: StateContext<EquipmentStateModel>, eq: Equipment): void {
    ctx.patchState({
      selected: eq,
      items: ctx.getState().items.map((x) => (x.id === eq.id ? eq : x)),
      byCustomer: ctx.getState().byCustomer.map((x) => (x.id === eq.id ? eq : x)),
    });
  }

  @Action(LoadEquipment)
  loadEquipment(ctx: StateContext<EquipmentStateModel>, { query }: LoadEquipment) {
    ctx.patchState({ loading: true, query });
    return this.api.list(query).pipe(
      tap(({ items, total }) => ctx.patchState({ items, total, loading: false })),
      catchError((err) => {
        ctx.patchState({ loading: false });
        throw err;
      }),
    );
  }

  @Action(LoadCustomerEquipment)
  loadByCustomer(ctx: StateContext<EquipmentStateModel>, { customerId }: LoadCustomerEquipment) {
    return this.api
      .byCustomer(customerId)
      .pipe(tap((rows) => ctx.patchState({ byCustomer: rows })));
  }

  @Action(LoadEquipmentDetail)
  loadDetail(ctx: StateContext<EquipmentStateModel>, { id }: LoadEquipmentDetail) {
    ctx.patchState({ selected: null });
    return this.api.get(id).pipe(tap((eq) => ctx.patchState({ selected: eq })));
  }

  @Action(CreateEquipment)
  create(ctx: StateContext<EquipmentStateModel>, { payload }: CreateEquipment) {
    return this.api.create(payload).pipe(
      tap((eq) =>
        ctx.patchState({
          byCustomer:
            eq.customerId === payload.customerId
              ? [...ctx.getState().byCustomer, eq]
              : ctx.getState().byCustomer,
        }),
      ),
    );
  }

  @Action(UpdateEquipment)
  update(ctx: StateContext<EquipmentStateModel>, { id, payload }: UpdateEquipment) {
    return this.api.update(id, payload).pipe(tap((eq) => this.applySelected(ctx, eq)));
  }

  @Action(SetEquipmentStatus)
  setStatus(ctx: StateContext<EquipmentStateModel>, { id, status }: SetEquipmentStatus) {
    return this.api.update(id, { status }).pipe(tap((eq) => this.applySelected(ctx, eq)));
  }

  @Action(LinkReport)
  linkReport(ctx: StateContext<EquipmentStateModel>, { id, reportId }: LinkReport) {
    return this.api.linkReport(id, reportId).pipe(tap((eq) => this.applySelected(ctx, eq)));
  }

  @Action(UnlinkReport)
  unlinkReport(ctx: StateContext<EquipmentStateModel>, { id, reportId }: UnlinkReport) {
    return this.api.unlinkReport(id, reportId).pipe(tap((eq) => this.applySelected(ctx, eq)));
  }

  @Action(DeleteEquipment)
  delete(ctx: StateContext<EquipmentStateModel>, { id, payload }: DeleteEquipment) {
    return this.api.remove(id, payload).pipe(
      tap(() => {
        const s = ctx.getState();
        ctx.patchState({
          items: s.items.filter((x) => x.id !== id),
          byCustomer: s.byCustomer.filter((x) => x.id !== id),
          total: Math.max(0, s.total - 1),
        });
      }),
    );
  }
}

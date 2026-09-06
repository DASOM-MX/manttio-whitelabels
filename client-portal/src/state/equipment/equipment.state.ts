import { Injectable, inject } from '@angular/core';
import { Action, Selector, State, StateContext } from '@ngxs/store';
import { catchError, tap } from 'rxjs';
import { PortalEquipmentService } from '../../app/services/http/portal-equipment.service';
import { EquipmentLoadList, EquipmentLoadOne } from './equipment.actions';
import { errorMessage } from '../../app/data/utils';
import type { PortalEquipmentDetail } from '../../app/data/dtos/portal-equipment/portal-equipment-detail.dto';
import type { PortalEquipmentListItem } from '../../app/data/dtos/portal-equipment/portal-equipment-list-item.dto';

export interface EquipmentStateModel {
  items: PortalEquipmentListItem[];
  total: number;
  loading: boolean;
  error: string | null;
  selected: PortalEquipmentDetail | null;
  selectedLoading: boolean;
  selectedError: string | null;
}

/** Equipos (04 §7): list + detail, scoped server-side to the token's
 *  customer. Retired units stay visible (only soft-deleted rows are hidden,
 *  A7). */
@State<EquipmentStateModel>({
  name: 'equipment',
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
export class EquipmentState {
  private readonly api = inject(PortalEquipmentService);

  @Selector() static items(s: EquipmentStateModel): PortalEquipmentListItem[] {
    return s.items;
  }
  @Selector() static total(s: EquipmentStateModel): number {
    return s.total;
  }
  @Selector() static loading(s: EquipmentStateModel): boolean {
    return s.loading;
  }
  @Selector() static error(s: EquipmentStateModel): string | null {
    return s.error;
  }
  @Selector() static selected(s: EquipmentStateModel): PortalEquipmentDetail | null {
    return s.selected;
  }
  @Selector() static selectedLoading(s: EquipmentStateModel): boolean {
    return s.selectedLoading;
  }
  @Selector() static selectedError(s: EquipmentStateModel): string | null {
    return s.selectedError;
  }

  @Action(EquipmentLoadList)
  loadList(ctx: StateContext<EquipmentStateModel>, { query }: EquipmentLoadList) {
    ctx.patchState({ loading: true, error: null });
    return this.api.list(query).pipe(
      tap(({ items, total }) => ctx.patchState({ items, total, loading: false })),
      catchError((err) => {
        ctx.patchState({
          loading: false,
          error: errorMessage(err, 'No se pudo cargar el equipo.'),
        });
        throw err;
      }),
    );
  }

  @Action(EquipmentLoadOne)
  loadOne(ctx: StateContext<EquipmentStateModel>, { id }: EquipmentLoadOne) {
    ctx.patchState({ selected: null, selectedLoading: true, selectedError: null });
    return this.api.get(id).pipe(
      tap((unit) => ctx.patchState({ selected: unit, selectedLoading: false })),
      catchError((err) => {
        ctx.patchState({
          selectedLoading: false,
          selectedError: errorMessage(err, 'No pudimos encontrar este equipo.'),
        });
        throw err;
      }),
    );
  }
}

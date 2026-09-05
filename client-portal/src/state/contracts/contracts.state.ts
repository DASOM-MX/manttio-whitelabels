import { Injectable, inject } from '@angular/core';
import { Action, Selector, State, StateContext } from '@ngxs/store';
import { catchError, tap } from 'rxjs';
import { PortalContractsService } from '../../app/services/http/portal-contracts.service';
import { ContractsLoadList, ContractsLoadOne } from './contracts.actions';
import { errorMessage } from '../../app/data/utils';
import type { PortalContractDetail } from '../../app/data/dtos/portal-contract/portal-contract-detail.dto';
import type { PortalContractListItem } from '../../app/data/dtos/portal-contract/portal-contract-list-item.dto';

export interface ContractsStateModel {
  items: PortalContractListItem[];
  total: number;
  loading: boolean;
  error: string | null;
  selected: PortalContractDetail | null;
  selectedLoading: boolean;
  selectedError: string | null;
}

/** Contratos (04 §4): list + detail, scoped server-side to the token's
 *  customer and to live (non-deleted) rows only (A7). */
@State<ContractsStateModel>({
  name: 'contracts',
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
export class ContractsState {
  private readonly api = inject(PortalContractsService);

  @Selector() static items(s: ContractsStateModel): PortalContractListItem[] {
    return s.items;
  }
  @Selector() static total(s: ContractsStateModel): number {
    return s.total;
  }
  @Selector() static loading(s: ContractsStateModel): boolean {
    return s.loading;
  }
  @Selector() static error(s: ContractsStateModel): string | null {
    return s.error;
  }
  @Selector() static selected(s: ContractsStateModel): PortalContractDetail | null {
    return s.selected;
  }
  @Selector() static selectedLoading(s: ContractsStateModel): boolean {
    return s.selectedLoading;
  }
  @Selector() static selectedError(s: ContractsStateModel): string | null {
    return s.selectedError;
  }

  @Action(ContractsLoadList)
  loadList(ctx: StateContext<ContractsStateModel>, { query }: ContractsLoadList) {
    ctx.patchState({ loading: true, error: null });
    return this.api.list(query).pipe(
      tap(({ items, total }) => ctx.patchState({ items, total, loading: false })),
      catchError((err) => {
        ctx.patchState({
          loading: false,
          error: errorMessage(err, 'No se pudieron cargar los contratos.'),
        });
        throw err;
      }),
    );
  }

  @Action(ContractsLoadOne)
  loadOne(ctx: StateContext<ContractsStateModel>, { id }: ContractsLoadOne) {
    ctx.patchState({ selected: null, selectedLoading: true, selectedError: null });
    return this.api.get(id).pipe(
      tap((contract) => ctx.patchState({ selected: contract, selectedLoading: false })),
      catchError((err) => {
        ctx.patchState({
          selectedLoading: false,
          selectedError: errorMessage(err, 'No pudimos encontrar este contrato.'),
        });
        throw err;
      }),
    );
  }
}

import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { catchError, tap } from 'rxjs';
import { ContractsService } from '../../app/services/http/contracts.service';
import {
  CreateContract,
  DeleteContract,
  LoadContract,
  LoadContracts,
  ReplaceContractFile,
  UpdateContract,
} from './contracts.actions';
import type { Contract } from '../../app/data/dtos/contract/contract';
import type { ContractListQuery } from '../../app/data/dtos/contract/contract-requests';

export interface ContractsStateModel {
  items: Contract[];
  total: number;
  loading: boolean;
  selected: Contract | null;
  query: ContractListQuery;
}

@State<ContractsStateModel>({
  name: 'contracts',
  defaults: {
    items: [],
    total: 0,
    loading: false,
    selected: null,
    query: {},
  },
})
@Injectable()
export class ContractsState {
  private readonly api = inject(ContractsService);

  @Selector() static items(s: ContractsStateModel): Contract[] {
    return s.items;
  }
  @Selector() static total(s: ContractsStateModel): number {
    return s.total;
  }
  @Selector() static loading(s: ContractsStateModel): boolean {
    return s.loading;
  }
  @Selector() static selected(s: ContractsStateModel): Contract | null {
    return s.selected;
  }

  /** A mutation returns the full contract, so every place it appears refreshes
   *  from one payload rather than each caller re-reading. */
  private applyUpdated(ctx: StateContext<ContractsStateModel>, contract: Contract): void {
    const s = ctx.getState();
    const swap = (list: Contract[]) => list.map((x) => (x.id === contract.id ? contract : x));
    ctx.patchState({ selected: contract, items: swap(s.items) });
  }

  @Action(LoadContracts)
  loadContracts(ctx: StateContext<ContractsStateModel>, { query }: LoadContracts) {
    ctx.patchState({ loading: true, query });
    return this.api.list(query).pipe(
      tap(({ items, total }) => ctx.patchState({ items, total, loading: false })),
      catchError((err) => {
        ctx.patchState({ loading: false });
        throw err;
      }),
    );
  }

  @Action(LoadContract)
  loadContract(ctx: StateContext<ContractsStateModel>, { id }: LoadContract) {
    // Clear first so the view shows skeletons rather than the previous record.
    ctx.patchState({ selected: null });
    return this.api.get(id).pipe(tap((contract) => ctx.patchState({ selected: contract })));
  }

  /** Nothing to patch: the list reloads from its URL params on the way back,
   *  and the cards that show a client's or a job's contracts fetch their own
   *  feed (they live outside this route, so this state is not even loaded). */
  @Action(CreateContract)
  create(_ctx: StateContext<ContractsStateModel>, { payload, file }: CreateContract) {
    return this.api.create(payload, file);
  }

  @Action(UpdateContract)
  update(ctx: StateContext<ContractsStateModel>, { id, payload }: UpdateContract) {
    return this.api.update(id, payload).pipe(tap((c) => this.applyUpdated(ctx, c)));
  }

  @Action(ReplaceContractFile)
  replaceFile(ctx: StateContext<ContractsStateModel>, { id, file }: ReplaceContractFile) {
    return this.api.replaceFile(id, file).pipe(tap((c) => this.applyUpdated(ctx, c)));
  }

  @Action(DeleteContract)
  delete(ctx: StateContext<ContractsStateModel>, { id, payload }: DeleteContract) {
    return this.api.remove(id, payload).pipe(
      tap(() => {
        const s = ctx.getState();
        ctx.patchState({
          items: s.items.filter((x) => x.id !== id),
          total: Math.max(0, s.total - 1),
        });
      }),
    );
  }
}

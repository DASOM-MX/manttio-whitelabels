import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { finalize, tap } from 'rxjs/operators';
import { CustomersService } from '../../http/customers.service';
import {
  LoadCustomers, LoadCustomer, SelectCustomer,
  CreateCustomer, UpdateCustomer, DeleteCustomer,
} from './customers.actions';
import type { CustomerRow } from '../../app/data/dtos/customer';

export interface CustomersStateModel {
  entities: Record<string, CustomerRow>;
  ids: string[];
  selected: CustomerRow | null;
  loading: boolean;
}

@State<CustomersStateModel>({
  name: 'customers',
  defaults: { entities: {}, ids: [], selected: null, loading: false },
})
@Injectable()
export class CustomersState {
  private readonly api = inject(CustomersService);

  @Selector() static list(s: CustomersStateModel): CustomerRow[] {
    return s.ids.map((id) => s.entities[id]).filter(Boolean) as CustomerRow[];
  }
  @Selector() static selected(s: CustomersStateModel): CustomerRow | null { return s.selected; }
  @Selector() static loading(s: CustomersStateModel): boolean { return s.loading; }

  static byId(id: string) {
    return (s: CustomersStateModel) => s.entities[id] ?? null;
  }

  @Action(LoadCustomers)
  loadList(ctx: StateContext<CustomersStateModel>) {
    ctx.patchState({ loading: true });
    return this.api.list().pipe(
      tap(({ customers }) => {
        const entities: Record<string, CustomerRow> = {};
        const ids: string[] = [];
        for (const c of customers) { entities[c.id] = c; ids.push(c.id); }
        ctx.patchState({ entities, ids });
      }),
      finalize(() => ctx.patchState({ loading: false })),
    );
  }

  @Action(LoadCustomer)
  loadOne(ctx: StateContext<CustomersStateModel>, { id }: LoadCustomer) {
    return this.api.get(id).pipe(
      tap(({ customer }) => {
        const s = ctx.getState();
        const ids = s.ids.includes(id) ? s.ids : [...s.ids, id];
        ctx.patchState({
          entities: { ...s.entities, [id]: customer },
          ids,
          selected: customer,
        });
      }),
    );
  }

  @Action(SelectCustomer)
  select(ctx: StateContext<CustomersStateModel>, { customer }: SelectCustomer) {
    ctx.patchState({ selected: customer });
  }

  @Action(CreateCustomer)
  create(ctx: StateContext<CustomersStateModel>, { payload }: CreateCustomer) {
    return this.api.create(payload).pipe(
      tap(({ customer }) => {
        const s = ctx.getState();
        ctx.patchState({
          entities: { ...s.entities, [customer.id]: customer },
          ids: s.ids.includes(customer.id) ? s.ids : [...s.ids, customer.id],
        });
      }),
    );
  }

  @Action(UpdateCustomer)
  update(ctx: StateContext<CustomersStateModel>, { id, payload }: UpdateCustomer) {
    return this.api.update(id, payload).pipe(
      tap(({ customer }) => {
        const s = ctx.getState();
        ctx.patchState({
          entities: { ...s.entities, [id]: customer },
          ids: s.ids.includes(id) ? s.ids : [...s.ids, id],
          selected: s.selected?.id === id ? customer : s.selected,
        });
      }),
    );
  }

  @Action(DeleteCustomer)
  remove(ctx: StateContext<CustomersStateModel>, { id }: DeleteCustomer) {
    return this.api.remove(id).pipe(
      tap(() => {
        const s = ctx.getState();
        const { [id]: _gone, ...rest } = s.entities;
        ctx.patchState({
          entities: rest,
          ids: s.ids.filter((x) => x !== id),
          selected: s.selected?.id === id ? null : s.selected,
        });
      }),
    );
  }
}

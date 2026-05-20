import { Injectable } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
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
  @Selector() static list(s: CustomersStateModel): CustomerRow[] {
    return s.ids.map((id) => s.entities[id]).filter(Boolean) as CustomerRow[];
  }
  @Selector() static selected(s: CustomersStateModel): CustomerRow | null { return s.selected; }
  @Selector() static loading(s: CustomersStateModel): boolean { return s.loading; }

  static byId(id: string) {
    return (s: CustomersStateModel) => s.entities[id] ?? null;
  }

  @Action(LoadCustomers)
  loadList(_ctx: StateContext<CustomersStateModel>) {
    // stub — wired up in PR #4 once CustomersService exists
  }

  @Action(LoadCustomer)
  loadOne(_ctx: StateContext<CustomersStateModel>, _action: LoadCustomer) {
    // stub — PR #4 will fetch + patch entities[id] + set selected
  }

  @Action(SelectCustomer)
  select(ctx: StateContext<CustomersStateModel>, { customer }: SelectCustomer) {
    ctx.patchState({ selected: customer });
  }

  @Action(CreateCustomer)
  create(_ctx: StateContext<CustomersStateModel>, _action: CreateCustomer) {
    // stub
  }

  @Action(UpdateCustomer)
  update(_ctx: StateContext<CustomersStateModel>, _action: UpdateCustomer) {
    // stub
  }

  @Action(DeleteCustomer)
  remove(_ctx: StateContext<CustomersStateModel>, _action: DeleteCustomer) {
    // stub
  }
}

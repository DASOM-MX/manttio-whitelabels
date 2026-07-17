import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { catchError, tap } from 'rxjs';
import { CustomersService } from '../../app/services/http/customers.service';
import {
  CreateCustomer,
  DeleteCustomer,
  LoadCustomer,
  LoadCustomers,
  SaveCustomerContacts,
  UpdateCustomer,
} from './customers.actions';
import type { Customer, CustomerListQuery } from '../../app/data/dtos/customer';

export interface CustomersStateModel {
  items: Customer[];
  total: number;
  loading: boolean;
  selected: Customer | null;
  query: CustomerListQuery;
}

@State<CustomersStateModel>({
  name: 'customers',
  defaults: { items: [], total: 0, loading: false, selected: null, query: {} },
})
@Injectable()
export class CustomersState {
  private readonly api = inject(CustomersService);

  @Selector() static items(s: CustomersStateModel): Customer[] {
    return s.items;
  }
  @Selector() static total(s: CustomersStateModel): number {
    return s.total;
  }
  @Selector() static loading(s: CustomersStateModel): boolean {
    return s.loading;
  }
  @Selector() static selected(s: CustomersStateModel): Customer | null {
    return s.selected;
  }
  /** Distinct tag set from the loaded rows — feeds the tags filter and the
   *  form's autocomplete until a dedicated endpoint exists (07 open ask). */
  @Selector() static knownTags(s: CustomersStateModel): string[] {
    return [...new Set(s.items.flatMap((c) => c.tags))].sort();
  }

  @Action(LoadCustomers)
  loadCustomers(ctx: StateContext<CustomersStateModel>, { query }: LoadCustomers) {
    ctx.patchState({ loading: true, query });
    return this.api.list(query).pipe(
      tap(({ items, total }) => ctx.patchState({ items, total, loading: false })),
      catchError((err) => {
        ctx.patchState({ loading: false });
        throw err;
      }),
    );
  }

  @Action(LoadCustomer)
  loadCustomer(ctx: StateContext<CustomersStateModel>, { id }: LoadCustomer) {
    ctx.patchState({ selected: null });
    return this.api.get(id).pipe(tap((customer) => ctx.patchState({ selected: customer })));
  }

  @Action(CreateCustomer)
  createCustomer(ctx: StateContext<CustomersStateModel>, { payload }: CreateCustomer) {
    return this.api.create(payload).pipe(tap((c) => ctx.patchState({ selected: c })));
  }

  @Action(UpdateCustomer)
  updateCustomer(ctx: StateContext<CustomersStateModel>, { id, payload }: UpdateCustomer) {
    return this.api.update(id, payload).pipe(
      tap((c) =>
        ctx.patchState({
          selected: c,
          items: ctx.getState().items.map((x) => (x.id === id ? c : x)),
        }),
      ),
    );
  }

  @Action(SaveCustomerContacts)
  saveCustomerContacts(
    ctx: StateContext<CustomersStateModel>,
    { id, contacts }: SaveCustomerContacts,
  ) {
    return this.api.saveContacts(id, contacts).pipe(
      tap((c) =>
        ctx.patchState({
          selected: c,
          items: ctx.getState().items.map((x) => (x.id === id ? c : x)),
        }),
      ),
    );
  }

  @Action(DeleteCustomer)
  deleteCustomer(ctx: StateContext<CustomersStateModel>, { id, payload }: DeleteCustomer) {
    return this.api.remove(id, payload).pipe(
      tap(() => {
        const s = ctx.getState();
        ctx.patchState({
          items: s.items.filter((c) => c.id !== id),
          total: Math.max(0, s.total - 1),
        });
      }),
    );
  }
}

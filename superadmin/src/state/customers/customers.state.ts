import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { catchError, tap } from 'rxjs';
import { CustomersService } from '../../app/services/http/customers.service';
import {
  AddInteraction,
  ChangeCustomerStatus,
  CreateCustomer,
  DeleteCustomer,
  LoadCustomer,
  LoadCustomerOptions,
  LoadCustomers,
  LoadInteractions,
  SaveCustomerContacts,
  SetFollowUp,
  UpdateCustomer,
} from './customers.actions';
import type { Customer, CustomerListQuery, CustomerOption } from '../../app/data/dtos/customer';
import type { Interaction } from '../../app/data/dtos/interaction';

export interface CustomersStateModel {
  items: Customer[];
  total: number;
  /** The whole roster (21 §3) — what pickers read. Deliberately NOT `items`:
   *  that slice is one filtered page of the clients list, so a picker sharing
   *  it shows whatever the list happened to fetch last. */
  options: CustomerOption[];
  loading: boolean;
  selected: Customer | null;
  selectedError: boolean;
  query: CustomerListQuery;
  /** Timeline of the selected customer (08 §2), newest-first, paged. */
  interactions: Interaction[];
  interactionsTotal: number;
  interactionsPage: number;
  interactionsLoading: boolean;
}

@State<CustomersStateModel>({
  name: 'customers',
  defaults: {
    items: [],
    total: 0,
    options: [],
    loading: false,
    selected: null,
    selectedError: false,
    query: {},
    interactions: [],
    interactionsTotal: 0,
    interactionsPage: 1,
    interactionsLoading: false,
  },
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
  @Selector() static options(s: CustomersStateModel): CustomerOption[] {
    return s.options;
  }
  @Selector() static loading(s: CustomersStateModel): boolean {
    return s.loading;
  }
  @Selector() static selected(s: CustomersStateModel): Customer | null {
    return s.selected;
  }
  @Selector() static selectedError(s: CustomersStateModel): boolean {
    return s.selectedError;
  }
  @Selector() static interactions(s: CustomersStateModel): Interaction[] {
    return s.interactions;
  }
  @Selector() static interactionsTotal(s: CustomersStateModel): number {
    return s.interactionsTotal;
  }
  @Selector() static interactionsLoading(s: CustomersStateModel): boolean {
    return s.interactionsLoading;
  }

  /** Distinct tag set from the loaded rows — feeds the tags filter and the
   *  form's autocomplete until a dedicated endpoint exists (07 open ask). */
  @Selector() static knownTags(s: CustomersStateModel): string[] {
    return [...new Set(s.items.flatMap((c) => c.tags ?? []))].sort();
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

  /** Roster fetch for pickers. No `loading` flag: it never gates a page, it
   *  fills a select, and sharing the list's flag would flicker the clients
   *  table whenever a dialog opened. */
  @Action(LoadCustomerOptions)
  loadCustomerOptions(ctx: StateContext<CustomersStateModel>) {
    return this.api
      .listOptions()
      .pipe(tap(({ items }) => ctx.patchState({ options: items })));
  }

  @Action(LoadCustomer)
  loadCustomer(ctx: StateContext<CustomersStateModel>, { id }: LoadCustomer) {
    ctx.patchState({ selected: null, selectedError: false });
    return this.api.get(id).pipe(
      tap((customer) => ctx.patchState({ selected: customer })),
      catchError((err) => {
        ctx.patchState({ selectedError: true });
        throw err;
      }),
    );
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

  @Action(ChangeCustomerStatus)
  changeStatus(ctx: StateContext<CustomersStateModel>, { id, payload }: ChangeCustomerStatus) {
    return this.api.changeStatus(id, payload).pipe(
      tap((c) =>
        ctx.patchState({
          selected: ctx.getState().selected?.id === id ? c : ctx.getState().selected,
          items: ctx.getState().items.map((x) => (x.id === id ? c : x)),
        }),
      ),
    );
  }

  @Action(SetFollowUp)
  setFollowUp(ctx: StateContext<CustomersStateModel>, { id, nextFollowUpAt }: SetFollowUp) {
    return this.api.update(id, { nextFollowUpAt }).pipe(
      tap((c) =>
        ctx.patchState({
          selected: ctx.getState().selected?.id === id ? c : ctx.getState().selected,
          items: ctx.getState().items.map((x) => (x.id === id ? c : x)),
        }),
      ),
    );
  }

  @Action(LoadInteractions)
  loadInteractions(ctx: StateContext<CustomersStateModel>, { customerId, page }: LoadInteractions) {
    ctx.patchState({ interactionsLoading: true });
    return this.api.listInteractions(customerId, { page }).pipe(
      tap(({ items, total }) =>
        ctx.patchState({
          // page 1 replaces (read-your-writes reload); later pages append.
          interactions: page === 1 ? items : [...ctx.getState().interactions, ...items],
          interactionsTotal: total,
          interactionsPage: page,
          interactionsLoading: false,
        }),
      ),
      catchError((err) => {
        ctx.patchState({ interactionsLoading: false });
        throw err;
      }),
    );
  }

  @Action(AddInteraction)
  addInteraction(ctx: StateContext<CustomersStateModel>, { customerId, payload }: AddInteraction) {
    return this.api.addInteraction(customerId, payload).pipe(
      tap((entry) =>
        ctx.patchState({
          interactions: [entry, ...ctx.getState().interactions],
          interactionsTotal: ctx.getState().interactionsTotal + 1,
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

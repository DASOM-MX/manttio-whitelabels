import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Action, Selector, State, StateContext, Store } from '@ngxs/store';
import { catchError, finalize, tap } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Customer } from '../../interfaces/customer';
import { AuthState } from '../auth/auth';
import { LoadCustomers } from './actions/load-customers';
import { CustomersStateModel } from './types/customers-state-model';

@State<CustomersStateModel>({
  name: 'customers',
  defaults: {
    items: [],
    total: 0,
    lastFetchedAt: null,
    loading: false,
  },
})
@Injectable()
export class CustomersState {
  private http = inject(HttpClient);
  private store = inject(Store);

  @Selector()
  static items(state: CustomersStateModel): Customer[] {
    return state.items;
  }

  @Selector()
  static total(state: CustomersStateModel): number {
    return state.total;
  }

  @Selector()
  static loading(state: CustomersStateModel): boolean {
    return state.loading;
  }

  @Selector()
  static lastFetchedAt(state: CustomersStateModel): number | null {
    return state.lastFetchedAt;
  }

  @Action(LoadCustomers)
  loadCustomers(ctx: StateContext<CustomersStateModel>, { forceRefresh }: LoadCustomers) {
    const state = ctx.getState();
    if (!forceRefresh && state.items.length > 0) {
      return;
    }

    const token = this.store.selectSnapshot(AuthState.token);
    ctx.patchState({ loading: true });

    return this.http
      .get<Customer[]>(`${environment.apiUrl}customers`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .pipe(
        tap((items) => {
          ctx.patchState({
            items,
            total: items.length,
            lastFetchedAt: Date.now(),
          });
        }),
        catchError((err) => {
          ctx.patchState({ loading: false });
          return throwError(() => err);
        }),
        finalize(() => ctx.patchState({ loading: false })),
      );
  }
}

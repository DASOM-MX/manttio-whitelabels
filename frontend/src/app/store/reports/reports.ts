import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Action, Selector, State, StateContext, Store } from '@ngxs/store';
import { forkJoin } from 'rxjs';
import { catchError, finalize, tap } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Customer } from '../../interfaces/customer';
import { AuthState } from '../auth/auth';
import { LoadReports } from './actions/load-reports';
import { Report } from './types/report';
import { ReportsStateModel } from './types/reports-state-model';

@State<ReportsStateModel>({
  name: 'reports',
  defaults: {
    items: [],
    total: 0,
    lastFetchedAt: null,
    loading: false,
  },
})
@Injectable()
export class ReportsState {
  private http = inject(HttpClient);
  private store = inject(Store);

  @Selector()
  static items(state: ReportsStateModel): Report[] {
    return state.items;
  }

  @Selector()
  static total(state: ReportsStateModel): number {
    return state.total;
  }

  @Selector()
  static loading(state: ReportsStateModel): boolean {
    return state.loading;
  }

  @Selector()
  static lastFetchedAt(state: ReportsStateModel): number | null {
    return state.lastFetchedAt;
  }

  @Action(LoadReports)
  loadReports(ctx: StateContext<ReportsStateModel>, { forceRefresh }: LoadReports) {
    const state = ctx.getState();
    if (!forceRefresh && state.items.length > 0) {
      return;
    }

    const token = this.store.selectSnapshot(AuthState.token);
    const headers = { Authorization: `Bearer ${token}` };

    ctx.patchState({ loading: true });

    return forkJoin({
      reports: this.http.get<Report[]>(`${environment.apiUrl}reports`, { headers }),
      customers: this.http.get<Customer[]>(`${environment.apiUrl}customers`, { headers }),
    }).pipe(
      tap(({ reports, customers }) => {
        const annotated: Report[] = reports.map((report) => {
          const customer = customers.find((c) => c.id === report.client_id);
          return {
            ...report,
            client_name: customer?.name || 'Desconocido',
            client_state: (customer as any)?.state || '',
            date_ts: report.date_departure
              ? new Date(report.date_departure).getTime()
              : 0,
          };
        });
        ctx.patchState({
          items: annotated,
          total: annotated.length,
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

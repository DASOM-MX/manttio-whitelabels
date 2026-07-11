import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { catchError, tap } from 'rxjs';
import { ReportsService } from '../../app/services/http/reports.service';
import { DeleteReport, LoadReport, LoadReports } from './reports.actions';
import type { ReportDetail, ReportListQuery, ReportSummary } from '../../app/data/dtos/report';

export interface ReportsStateModel {
  items: ReportSummary[];
  total: number;
  loading: boolean;
  selected: ReportDetail | null;
  query: ReportListQuery;
}

@State<ReportsStateModel>({
  name: 'reports',
  defaults: { items: [], total: 0, loading: false, selected: null, query: {} },
})
@Injectable()
export class ReportsState {
  private readonly api = inject(ReportsService);

  @Selector() static items(s: ReportsStateModel): ReportSummary[] {
    return s.items;
  }
  @Selector() static total(s: ReportsStateModel): number {
    return s.total;
  }
  @Selector() static loading(s: ReportsStateModel): boolean {
    return s.loading;
  }
  @Selector() static selected(s: ReportsStateModel): ReportDetail | null {
    return s.selected;
  }

  @Action(LoadReports)
  loadReports(ctx: StateContext<ReportsStateModel>, { query }: LoadReports) {
    ctx.patchState({ loading: true, query });
    return this.api.list(query).pipe(
      tap(({ items, total }) => ctx.patchState({ items, total, loading: false })),
      catchError((err) => {
        ctx.patchState({ loading: false });
        throw err;
      }),
    );
  }

  @Action(LoadReport)
  loadReport(ctx: StateContext<ReportsStateModel>, { id }: LoadReport) {
    ctx.patchState({ selected: null });
    return this.api.get(id).pipe(tap((report) => ctx.patchState({ selected: report })));
  }

  @Action(DeleteReport)
  deleteReport(ctx: StateContext<ReportsStateModel>, { id, payload }: DeleteReport) {
    return this.api.remove(id, payload).pipe(
      tap(() => {
        const s = ctx.getState();
        ctx.patchState({
          items: s.items.filter((r) => r.id !== id),
          total: Math.max(0, s.total - 1),
        });
      }),
    );
  }
}

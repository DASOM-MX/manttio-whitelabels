import { Injectable, inject } from '@angular/core';
import { Action, Selector, State, StateContext } from '@ngxs/store';
import { catchError, tap } from 'rxjs';
import { PortalReportsService } from '../../app/services/http/portal-reports.service';
import { ReportsLoadList, ReportsLoadOne } from './reports.actions';
import { errorMessage } from '../../app/data/utils';
import type { PortalReportDetail } from '../../app/data/dtos/portal-report/portal-report-detail.dto';
import type { PortalReportListItem } from '../../app/data/dtos/portal-report/portal-report-list-item.dto';

export interface ReportsStateModel {
  items: PortalReportListItem[];
  total: number;
  loading: boolean;
  error: string | null;
  selected: PortalReportDetail | null;
  selectedLoading: boolean;
  selectedError: string | null;
}

/** Reportes (04 §3): list + detail, scoped server-side to the token's
 *  customer and to released statuses only (A7) — there is no client-side
 *  filtering to add here. */
@State<ReportsStateModel>({
  name: 'reports',
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
export class ReportsState {
  private readonly api = inject(PortalReportsService);

  @Selector() static items(s: ReportsStateModel): PortalReportListItem[] {
    return s.items;
  }
  @Selector() static total(s: ReportsStateModel): number {
    return s.total;
  }
  @Selector() static loading(s: ReportsStateModel): boolean {
    return s.loading;
  }
  @Selector() static error(s: ReportsStateModel): string | null {
    return s.error;
  }
  @Selector() static selected(s: ReportsStateModel): PortalReportDetail | null {
    return s.selected;
  }
  @Selector() static selectedLoading(s: ReportsStateModel): boolean {
    return s.selectedLoading;
  }
  @Selector() static selectedError(s: ReportsStateModel): string | null {
    return s.selectedError;
  }

  @Action(ReportsLoadList)
  loadList(ctx: StateContext<ReportsStateModel>, { query }: ReportsLoadList) {
    ctx.patchState({ loading: true, error: null });
    return this.api.list(query).pipe(
      tap(({ items, total }) => ctx.patchState({ items, total, loading: false })),
      catchError((err) => {
        ctx.patchState({
          loading: false,
          error: errorMessage(err, 'No se pudieron cargar los reportes.'),
        });
        throw err;
      }),
    );
  }

  @Action(ReportsLoadOne)
  loadOne(ctx: StateContext<ReportsStateModel>, { id }: ReportsLoadOne) {
    ctx.patchState({ selected: null, selectedLoading: true, selectedError: null });
    return this.api.get(id).pipe(
      tap((report) => ctx.patchState({ selected: report, selectedLoading: false })),
      catchError((err) => {
        ctx.patchState({
          selectedLoading: false,
          selectedError: errorMessage(err, 'No pudimos encontrar este reporte.'),
        });
        throw err;
      }),
    );
  }
}

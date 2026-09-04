import { Injectable, inject } from '@angular/core';
import { Action, Selector, State, StateContext } from '@ngxs/store';
import { catchError, tap } from 'rxjs';
import { PortalQuotationsService } from '../../app/services/http/portal-quotations.service';
import { QuotationsLoadList, QuotationsLoadOne } from './quotations.actions';
import { errorMessage } from '../../app/data/utils';
import type { PortalQuotationDetail } from '../../app/data/dtos/portal-quotation/portal-quotation-detail.dto';
import type { PortalQuotationListItem } from '../../app/data/dtos/portal-quotation/portal-quotation-list-item.dto';

export interface QuotationsStateModel {
  items: PortalQuotationListItem[];
  total: number;
  loading: boolean;
  error: string | null;
  selected: PortalQuotationDetail | null;
  selectedLoading: boolean;
  selectedError: string | null;
}

/** Cotizaciones (04 §5): list + detail, read-only — the approve/decline
 *  decision is 05's own action, not this state's. Scoped server-side to the
 *  token's customer and to statuses the customer was actually mailed (A7). */
@State<QuotationsStateModel>({
  name: 'quotations',
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
export class QuotationsState {
  private readonly api = inject(PortalQuotationsService);

  @Selector() static items(s: QuotationsStateModel): PortalQuotationListItem[] {
    return s.items;
  }
  @Selector() static total(s: QuotationsStateModel): number {
    return s.total;
  }
  @Selector() static loading(s: QuotationsStateModel): boolean {
    return s.loading;
  }
  @Selector() static error(s: QuotationsStateModel): string | null {
    return s.error;
  }
  @Selector() static selected(s: QuotationsStateModel): PortalQuotationDetail | null {
    return s.selected;
  }
  @Selector() static selectedLoading(s: QuotationsStateModel): boolean {
    return s.selectedLoading;
  }
  @Selector() static selectedError(s: QuotationsStateModel): string | null {
    return s.selectedError;
  }

  @Action(QuotationsLoadList)
  loadList(ctx: StateContext<QuotationsStateModel>, { query }: QuotationsLoadList) {
    ctx.patchState({ loading: true, error: null });
    return this.api.list(query).pipe(
      tap(({ items, total }) => ctx.patchState({ items, total, loading: false })),
      catchError((err) => {
        ctx.patchState({
          loading: false,
          error: errorMessage(err, 'No se pudieron cargar las cotizaciones.'),
        });
        throw err;
      }),
    );
  }

  @Action(QuotationsLoadOne)
  loadOne(ctx: StateContext<QuotationsStateModel>, { id }: QuotationsLoadOne) {
    ctx.patchState({ selected: null, selectedLoading: true, selectedError: null });
    return this.api.get(id).pipe(
      tap((quotation) => ctx.patchState({ selected: quotation, selectedLoading: false })),
      catchError((err) => {
        ctx.patchState({
          selectedLoading: false,
          selectedError: errorMessage(err, 'No pudimos encontrar esta cotización.'),
        });
        throw err;
      }),
    );
  }
}

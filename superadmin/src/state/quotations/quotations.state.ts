import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { catchError, tap } from 'rxjs';
import { QuotationsService } from '../../app/services/http/quotations.service';
import {
  CancelQuotation,
  CreateQuotation,
  DeleteQuotation,
  LoadQuotationDetail,
  LoadQuotationTimeline,
  LoadQuotations,
  ReviseQuotation,
  SendQuotation,
  UpdateQuotation,
} from './quotations.actions';
import type { QuotationDetail, QuotationSummary } from '../../app/data/dtos/quotation/quotation';
import type { QuotationEvent } from '../../app/data/dtos/quotation/quotation-event';
import type {
  QuotationListQuery,
  SendQuotationResult,
} from '../../app/data/dtos/quotation/quotation-requests';

export interface QuotationsStateModel {
  items: QuotationSummary[];
  total: number;
  loading: boolean;
  selected: QuotationDetail | null;
  selectedError: boolean;
  query: QuotationListQuery;
  timeline: QuotationEvent[];
  timelineLoading: boolean;
  /** Outcome of the last send. `dispatch()` resolves to the store rather than
   *  to the response, so this is the only way the dialog gets to name the
   *  addresses that bounced — and a send with failures still succeeded for
   *  everyone else, which is exactly what makes it worth reporting. */
  lastDelivery: SendQuotationResult['delivery'] | null;
}

@State<QuotationsStateModel>({
  name: 'quotations',
  defaults: {
    items: [],
    total: 0,
    loading: false,
    selected: null,
    selectedError: false,
    query: {},
    timeline: [],
    timelineLoading: false,
    lastDelivery: null,
  },
})
@Injectable()
export class QuotationsState {
  private readonly quotationsService = inject(QuotationsService);

  @Selector() static items(s: QuotationsStateModel): QuotationSummary[] {
    return s.items;
  }
  @Selector() static total(s: QuotationsStateModel): number {
    return s.total;
  }
  @Selector() static loading(s: QuotationsStateModel): boolean {
    return s.loading;
  }
  @Selector() static selected(s: QuotationsStateModel): QuotationDetail | null {
    return s.selected;
  }
  @Selector() static selectedError(s: QuotationsStateModel): boolean {
    return s.selectedError;
  }
  @Selector() static timeline(s: QuotationsStateModel): QuotationEvent[] {
    return s.timeline;
  }
  @Selector() static timelineLoading(s: QuotationsStateModel): boolean {
    return s.timelineLoading;
  }
  @Selector() static lastDelivery(s: QuotationsStateModel): SendQuotationResult['delivery'] | null {
    return s.lastDelivery;
  }

  @Action(LoadQuotations)
  load(ctx: StateContext<QuotationsStateModel>, { query }: LoadQuotations) {
    ctx.patchState({ loading: true, query });
    return this.quotationsService.list(query).pipe(
      tap(({ items, total }) => ctx.patchState({ items, total, loading: false })),
      catchError((err) => {
        ctx.patchState({ loading: false });
        throw err;
      }),
    );
  }

  /** Clears `selected` first so the view never shows the previously-open quote
   *  under the new one's route while the fetch is in flight. */
  @Action(LoadQuotationDetail)
  loadDetail(ctx: StateContext<QuotationsStateModel>, { id }: LoadQuotationDetail) {
    ctx.patchState({ selected: null, selectedError: false });
    return this.quotationsService.get(id).pipe(
      tap((quotation) => ctx.patchState({ selected: quotation })),
      catchError((err) => {
        ctx.patchState({ selectedError: true });
        throw err;
      }),
    );
  }

  @Action(LoadQuotationTimeline)
  loadTimeline(ctx: StateContext<QuotationsStateModel>, { id }: LoadQuotationTimeline) {
    ctx.patchState({ timelineLoading: true });
    return this.quotationsService.timeline(id).pipe(
      tap((timeline) => ctx.patchState({ timeline, timelineLoading: false })),
      catchError((err) => {
        ctx.patchState({ timeline: [], timelineLoading: false });
        throw err;
      }),
    );
  }

  /** Parks the created quote in `selected` so the builder can navigate to it:
   *  `dispatch()` resolves to the store, not to the response, so this is the
   *  only place the new id is available. The view it lands on reloads the
   *  detail anyway. */
  @Action(CreateQuotation)
  create(ctx: StateContext<QuotationsStateModel>, { payload }: CreateQuotation) {
    return this.quotationsService
      .create(payload)
      .pipe(tap((row) => ctx.patchState({ selected: row })));
  }

  @Action(UpdateQuotation)
  update(ctx: StateContext<QuotationsStateModel>, { id, payload }: UpdateQuotation) {
    return this.quotationsService.update(id, payload).pipe(tap((row) => this.replace(ctx, row)));
  }

  /** A send can **lower** the status: adding a reviewer to an approved quote
   *  makes it `partially_approved` again, because it is no longer true that
   *  everyone approved. The server's returned quote is therefore authoritative
   *  over anything the page assumed. */
  @Action(SendQuotation)
  send(ctx: StateContext<QuotationsStateModel>, { id, payload }: SendQuotation) {
    ctx.patchState({ lastDelivery: null });
    return this.quotationsService.send(id, payload).pipe(
      tap((result) => {
        this.replace(ctx, result.quotation);
        ctx.patchState({ lastDelivery: result.delivery });
      }),
    );
  }

  /** Lands the **new** draft in `selected`, not the revised one — the caller
   *  navigates straight to it. The old quote is now cancelled, so its list row
   *  is stale; the list refetches on next entry rather than being patched to a
   *  status this response doesn't carry. */
  @Action(ReviseQuotation)
  revise(ctx: StateContext<QuotationsStateModel>, { id }: ReviseQuotation) {
    return this.quotationsService.revise(id).pipe(tap((row) => ctx.patchState({ selected: row })));
  }

  @Action(CancelQuotation)
  cancel(ctx: StateContext<QuotationsStateModel>, { id, payload }: CancelQuotation) {
    return this.quotationsService.cancel(id, payload).pipe(tap((row) => this.replace(ctx, row)));
  }

  @Action(DeleteQuotation)
  delete(ctx: StateContext<QuotationsStateModel>, { id, payload }: DeleteQuotation) {
    return this.quotationsService.remove(id, payload).pipe(
      tap(() => {
        const state = ctx.getState();
        ctx.patchState({
          items: state.items.filter((x) => x.id !== id),
          total: Math.max(0, state.total - 1),
          selected: state.selected?.id === id ? null : state.selected,
        });
      }),
    );
  }

  /** Writes a server-returned quote over both the open detail and its list row,
   *  so a status the tally moved is reflected in the table behind the page. */
  private replace(ctx: StateContext<QuotationsStateModel>, row: QuotationDetail): void {
    const state = ctx.getState();
    ctx.patchState({
      selected: row,
      items: state.items.map((x) => (x.id === row.id ? { ...x, ...row } : x)),
    });
  }
}

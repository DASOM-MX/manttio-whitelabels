import { Injectable, inject } from '@angular/core';
import { Actions, State, Action, ofActionDispatched, Selector, StateContext, Store } from '@ngxs/store';
import { catchError, defer, EMPTY, of, repeat, retry, switchMap, takeUntil, tap, timer } from 'rxjs';
import { VisitsService } from '../../app/services/http/visits.service';
import { AuthState } from '../auth/auth.state';
import {
  AssignVisit,
  CloseVisit,
  CorrectVisit,
  CorrectVisitActuals,
  CreateVisit,
  ListenVisits,
  LoadVisits,
  RescheduleVisit,
  RespondVisit,
  StopListeningVisits,
  VisitEventReceived,
} from './visits.actions';
import type { Visit, VisitListQuery } from '../../app/data/dtos/visit';

export interface VisitsStateModel {
  /** The loaded window's visits — whatever range the last `LoadVisits` asked
   *  for (the calendar's visible week). */
  items: Visit[];
  /** What that window WAS asked with — the stream's re-sync re-reads it on
   *  every reconnect, and the live upsert tests membership against it. */
  lastQuery: VisitListQuery | null;
  loading: boolean;
}

/** Reconnect backoff: 1 s → capped 5 s (the notifications stream's shape). */
const RECONNECT_CAP_MS = 5_000;
const RECONNECT_STEP_MS = 1_000;

@State<VisitsStateModel>({
  name: 'visits',
  defaults: {
    items: [],
    lastQuery: null,
    loading: false,
  },
})
@Injectable()
export class VisitsState {
  private readonly api = inject(VisitsService);
  private readonly store = inject(Store);
  private readonly actions$ = inject(Actions);

  @Selector() static items(s: VisitsStateModel): Visit[] {
    return s.items;
  }
  @Selector() static loading(s: VisitsStateModel): boolean {
    return s.loading;
  }

  /** `cancelUncompleted`: arrow-spamming the calendar dispatches overlapping
   *  loads, and without cancellation the last *response* wins — which can be
   *  the older window arriving late, leaving the grid showing last week under
   *  this week's label. */
  @Action(LoadVisits, { cancelUncompleted: true })
  load(ctx: StateContext<VisitsStateModel>, { query }: LoadVisits) {
    ctx.patchState({ loading: true, lastQuery: query });
    return this.api.list(query).pipe(
      tap((items) => ctx.patchState({ items, loading: false })),
      catchError((err) => {
        ctx.patchState({ loading: false });
        throw err;
      }),
    );
  }

  /** Session-length live subscription while the calendar is on screen (12
   *  CP-4) — the notifications-stream idiom. `retry`/`repeat` resubscribe the
   *  whole `defer`, so every (re)connect re-reads the loaded window before the
   *  stream reopens: the stream has no replay, and whatever fell between
   *  connections costs exactly one window read. Stopped by
   *  StopListeningVisits (page leave) or a re-dispatch (`cancelUncompleted`). */
  @Action(ListenVisits, { cancelUncompleted: true })
  listen(ctx: StateContext<VisitsStateModel>) {
    return defer(() => {
      const query = ctx.getState().lastQuery;
      return query ? ctx.dispatch(new LoadVisits(query)) : of(null);
    }).pipe(
      switchMap(() => {
        const token = this.store.selectSnapshot(AuthState.token);
        // No token means the shell is tearing down around us — stay silent.
        return token ? this.api.stream(token) : EMPTY;
      }),
      tap((evt) => {
        if (evt.event === 'visit') ctx.dispatch(new VisitEventReceived(evt.data));
      }),
      // A server that ENDS the stream cleanly (proxy idle-close, deploy) and
      // one that errors both reconnect with the same capped backoff.
      repeat({
        delay: (count) => timer(Math.min(RECONNECT_CAP_MS, RECONNECT_STEP_MS * count)),
      }),
      retry({
        delay: (_err, retryCount) =>
          timer(Math.min(RECONNECT_CAP_MS, RECONNECT_STEP_MS * retryCount)),
      }),
      takeUntil(this.actions$.pipe(ofActionDispatched(StopListeningVisits))),
    );
  }

  /** Live upsert (12 CP-4). A frame for a loaded visit replaces it; one for a
   *  visit inside the window appends (the render sorts by start, so position
   *  is irrelevant); anything else drops. Membership is time-only on purpose:
   *  the calendar's window query never narrows beyond `from`/`to` (the tech
   *  filter is client-side), and a code search shows a fixed result set that
   *  live inserts would only distort. */
  @Action(VisitEventReceived)
  eventReceived(ctx: StateContext<VisitsStateModel>, { frame }: VisitEventReceived) {
    const { items, lastQuery } = ctx.getState();
    const visit = frame.visit;
    if (items.some((item) => item.id === visit.id)) {
      this.patchItem(ctx, visit);
      return;
    }
    if (!lastQuery?.from || !lastQuery?.to) return;
    // ISO-8601 UTC instants on both sides — lexical comparison is safe.
    if (visit.scheduledStart < lastQuery.from || visit.scheduledStart > lastQuery.to) return;
    ctx.patchState({ items: [...items, visit] });
  }

  /** The new visit may fall outside the loaded window — the page re-loads its
   *  week rather than this handler guessing membership. */
  @Action(CreateVisit)
  create(_ctx: StateContext<VisitsStateModel>, { payload }: CreateVisit) {
    return this.api.create(payload);
  }

  @Action(CorrectVisit)
  correct(ctx: StateContext<VisitsStateModel>, { id, payload }: CorrectVisit) {
    return this.api.correct(id, payload).pipe(tap((visit) => this.patchItem(ctx, visit)));
  }

  @Action(AssignVisit)
  assign(ctx: StateContext<VisitsStateModel>, { id, technicianId }: AssignVisit) {
    return this.api.assign(id, { technicianId }).pipe(tap((visit) => this.patchItem(ctx, visit)));
  }

  @Action(CorrectVisitActuals)
  correctActuals(ctx: StateContext<VisitsStateModel>, { id, payload }: CorrectVisitActuals) {
    return this.api.correctActuals(id, payload).pipe(tap((visit) => this.patchItem(ctx, visit)));
  }

  @Action(RespondVisit)
  respond(ctx: StateContext<VisitsStateModel>, { id, payload }: RespondVisit) {
    return this.api.respond(id, payload).pipe(tap((visit) => this.patchItem(ctx, visit)));
  }

  @Action(CloseVisit)
  close(ctx: StateContext<VisitsStateModel>, { id, payload }: CloseVisit) {
    return this.api.close(id, payload).pipe(tap((visit) => this.patchItem(ctx, visit)));
  }

  /** Returns the successor; like `CreateVisit`, its week membership is the
   *  page's problem — the closed predecessor is already patched by `CloseVisit`. */
  @Action(RescheduleVisit)
  reschedule(_ctx: StateContext<VisitsStateModel>, { id, payload }: RescheduleVisit) {
    return this.api.reschedule(id, payload);
  }

  /** In-place update of a loaded chip after a mutation — a corrected date may
   *  move it across day columns, which the sorted-by-start render absorbs. */
  private patchItem(ctx: StateContext<VisitsStateModel>, visit: Visit): void {
    ctx.patchState({
      items: ctx.getState().items.map((item) => (item.id === visit.id ? visit : item)),
    });
  }
}

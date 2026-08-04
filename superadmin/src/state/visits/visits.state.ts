import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { catchError, tap } from 'rxjs';
import { VisitsService } from '../../app/services/http/visits.service';
import {
  AssignVisit,
  CloseVisit,
  CorrectVisit,
  CorrectVisitActuals,
  CreateVisit,
  LoadVisits,
  RescheduleVisit,
  RespondVisit,
} from './visits.actions';
import type { Visit } from '../../app/data/dtos/visit';

export interface VisitsStateModel {
  /** The loaded window's visits — whatever range the last `LoadVisits` asked
   *  for (the calendar's visible week). */
  items: Visit[];
  loading: boolean;
}

@State<VisitsStateModel>({
  name: 'visits',
  defaults: {
    items: [],
    loading: false,
  },
})
@Injectable()
export class VisitsState {
  private readonly api = inject(VisitsService);

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
    ctx.patchState({ loading: true });
    return this.api.list(query).pipe(
      tap((items) => ctx.patchState({ items, loading: false })),
      catchError((err) => {
        ctx.patchState({ loading: false });
        throw err;
      }),
    );
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

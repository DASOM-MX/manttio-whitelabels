import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { tap } from 'rxjs/operators';
import { VisitsService } from '../../http/visits.service';
import type { Visit } from '../../app/data/dtos/visit';
import { LoadMyVisits, LoadVisit, VisitSynced } from './visits.actions';

export interface VisitsStateModel {
  /** The loaded window of the technician's visits. */
  list: Visit[];
  /** The visit-detail page's record. */
  selected: Visit | null;
  loading: boolean;
}

@State<VisitsStateModel>({
  name: 'visits',
  defaults: { list: [], selected: null, loading: false },
})
@Injectable()
export class VisitsState {
  private readonly visits = inject(VisitsService);

  @Selector() static list(s: VisitsStateModel): Visit[] {
    return s.list;
  }
  @Selector() static selected(s: VisitsStateModel): Visit | null {
    return s.selected;
  }
  @Selector() static loading(s: VisitsStateModel): boolean {
    return s.loading;
  }

  /** `cancelUncompleted`: a reload racing a slow first load must not let the
   *  older response land last and overwrite the newer window. */
  @Action(LoadMyVisits, { cancelUncompleted: true })
  load(ctx: StateContext<VisitsStateModel>, { query }: LoadMyVisits) {
    ctx.patchState({ loading: true });
    return this.visits.list(query).pipe(
      tap({
        next: (list) => ctx.patchState({ list, loading: false }),
        error: () => ctx.patchState({ loading: false }),
      }),
    );
  }

  @Action(LoadVisit)
  loadOne(ctx: StateContext<VisitsStateModel>, { id }: LoadVisit) {
    return this.visits.get(id).pipe(tap((visit) => ctx.patchState({ selected: visit })));
  }

  @Action(VisitSynced)
  synced(ctx: StateContext<VisitsStateModel>, { visit }: VisitSynced) {
    const s = ctx.getState();
    ctx.patchState({
      list: s.list.map((v) => (v.id === visit.id ? visit : v)),
      selected: s.selected?.id === visit.id ? visit : s.selected,
    });
  }
}

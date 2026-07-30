import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { catchError, tap } from 'rxjs';
import { ServicesCatalogService } from '../../app/services/http/services-catalog.service';
import {
  CreateService,
  DeleteService,
  LoadService,
  LoadServices,
  LoadServiceTimeline,
  UpdateService,
} from './services.actions';
import type { Service, ServiceEvent, ServiceListQuery } from '../../app/data/dtos/service';

export interface ServicesStateModel {
  items: Service[];
  loading: boolean;
  selected: Service | null;
  query: ServiceListQuery;
  timeline: ServiceEvent[];
  timelineLoading: boolean;
}

@State<ServicesStateModel>({
  name: 'services',
  defaults: {
    items: [],
    loading: false,
    selected: null,
    query: {},
    timeline: [],
    timelineLoading: false,
  },
})
@Injectable()
export class ServicesState {
  private readonly api = inject(ServicesCatalogService);

  @Selector() static items(s: ServicesStateModel): Service[] {
    return s.items;
  }
  @Selector() static loading(s: ServicesStateModel): boolean {
    return s.loading;
  }
  @Selector() static selected(s: ServicesStateModel): Service | null {
    return s.selected;
  }
  @Selector() static timeline(s: ServicesStateModel): ServiceEvent[] {
    return s.timeline;
  }
  @Selector() static timelineLoading(s: ServicesStateModel): boolean {
    return s.timelineLoading;
  }

  /** No `total` selector: the catalog endpoint has no pagination, so the row
   *  count is just `items.length` and a second source of truth would drift. */
  @Action(LoadServices)
  load(ctx: StateContext<ServicesStateModel>, { query }: LoadServices) {
    ctx.patchState({ loading: true, query });
    return this.api.list(query).pipe(
      tap(({ services }) => ctx.patchState({ items: services, loading: false })),
      catchError((err) => {
        ctx.patchState({ loading: false });
        throw err;
      }),
    );
  }

  @Action(LoadService)
  loadOne(ctx: StateContext<ServicesStateModel>, { id }: LoadService) {
    // Cleared first so the form page never hydrates from a stale row.
    ctx.patchState({ selected: null });
    return this.api.get(id).pipe(tap((svc) => ctx.patchState({ selected: svc })));
  }

  @Action(LoadServiceTimeline)
  loadTimeline(ctx: StateContext<ServicesStateModel>, { id }: LoadServiceTimeline) {
    // Cleared alongside the flag so a service never shows another's trail
    // while its own is in flight.
    ctx.patchState({ timeline: [], timelineLoading: true });
    return this.api.timeline(id).pipe(
      tap((timeline) => ctx.patchState({ timeline, timelineLoading: false })),
      catchError((err) => {
        ctx.patchState({ timeline: [], timelineLoading: false });
        throw err;
      }),
    );
  }

  /** The list page refetches after a save, so create only needs to not lie
   *  about state in the meantime. */
  @Action(CreateService)
  create(_ctx: StateContext<ServicesStateModel>, { payload }: CreateService) {
    return this.api.create(payload);
  }

  @Action(UpdateService)
  update(ctx: StateContext<ServicesStateModel>, { id, payload }: UpdateService) {
    return this.api.update(id, payload).pipe(
      tap((svc) =>
        ctx.patchState({
          selected: svc,
          items: ctx.getState().items.map((x) => (x.id === svc.id ? svc : x)),
        }),
      ),
    );
  }

  @Action(DeleteService)
  delete(ctx: StateContext<ServicesStateModel>, { id, payload }: DeleteService) {
    return this.api
      .remove(id, payload)
      .pipe(tap(() => ctx.patchState({ items: ctx.getState().items.filter((x) => x.id !== id) })));
  }
}

import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { catchError, tap } from 'rxjs';
import { ServicesCatalogService } from '../../app/services/http/services-catalog.service';
import {
  CreateService,
  DeleteService,
  ImportServices,
  LoadService,
  LoadServiceOptions,
  LoadServices,
  LoadServiceTimeline,
  UpdateService,
} from './services.actions';
import type {
  Service,
  ServiceEvent,
  ServiceListQuery,
  ServiceOption,
} from '../../app/data/dtos/service';

export interface ServicesStateModel {
  items: Service[];
  /** Filtered row count from the server (21 §2) — **never** `items.length`,
   *  which is one page since CP-5 and would leave the paginator with a single
   *  page forever. */
  total: number;
  /** The whole catalog (21 §3) — what pickers read. Deliberately NOT `items`:
   *  CP-5 makes the catalog browse paged, and a picker sharing that slice would
   *  silently offer only page 1. */
  options: ServiceOption[];
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
    total: 0,
    options: [],
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
  @Selector() static total(s: ServicesStateModel): number {
    return s.total;
  }
  @Selector() static options(s: ServicesStateModel): ServiceOption[] {
    return s.options;
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

  /** One page of the catalog browse (21 CP-5). `total` comes off the wire —
   *  the paginator reads it, and deriving it from `items.length` is the exact
   *  defect plan 21 exists to remove. */
  @Action(LoadServices)
  load(ctx: StateContext<ServicesStateModel>, { query }: LoadServices) {
    ctx.patchState({ loading: true, query });
    return this.api.list(query).pipe(
      tap(({ items, total }) => ctx.patchState({ items, total, loading: false })),
      catchError((err) => {
        ctx.patchState({ loading: false });
        throw err;
      }),
    );
  }

  /** Roster fetch for pickers. No `loading` flag — it fills a select, it never
   *  gates a page, and sharing the list's flag would flicker the catalog table. */
  @Action(LoadServiceOptions)
  loadOptions(ctx: StateContext<ServicesStateModel>) {
    return this.api
      .listOptions()
      .pipe(tap((options) => ctx.patchState({ options })));
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

  /** Same posture as create: the import page navigates back to the list,
   *  which refetches — no optimistic state here. */
  @Action(ImportServices)
  import(_ctx: StateContext<ServicesStateModel>, { rows }: ImportServices) {
    return this.api.importRows(rows);
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

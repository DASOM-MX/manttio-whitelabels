import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { catchError, tap } from 'rxjs';
import { ServicesCatalogService } from '../../app/services/http/services-catalog.service';
import { CreateService, DeleteService, LoadServices, UpdateService } from './services.actions';
import type { Service, ServiceListQuery } from '../../app/data/dtos/service';

export interface ServicesStateModel {
  items: Service[];
  loading: boolean;
  selected: Service | null;
  query: ServiceListQuery;
}

@State<ServicesStateModel>({
  name: 'services',
  defaults: { items: [], loading: false, selected: null, query: {} },
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

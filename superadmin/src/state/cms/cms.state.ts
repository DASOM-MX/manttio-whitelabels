import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { catchError, tap } from 'rxjs';
import { CmsService } from '../../app/services/http/cms.service';
import {
  CreateCmsClient,
  DeleteCmsClient,
  LoadCmsClients,
  LoadCmsHome,
  PublishCms,
  SaveCmsHome,
  UpdateCmsClient,
} from './cms.actions';
import type { CmsClient, CmsHome } from '../../app/data/dtos/cms';

export interface CmsStateModel {
  home: CmsHome | null;
  homeUnpublished: boolean;
  clients: CmsClient[];
  clientsUnpublished: boolean;
  loading: boolean;
  saving: boolean;
}

const busyOff = { loading: false, saving: false };

@State<CmsStateModel>({
  name: 'cms',
  defaults: {
    home: null,
    homeUnpublished: false,
    clients: [],
    clientsUnpublished: false,
    loading: false,
    saving: false,
  },
})
@Injectable()
export class CmsState {
  private readonly api = inject(CmsService);

  @Selector() static home(s: CmsStateModel): CmsHome | null {
    return s.home;
  }
  @Selector() static homeUnpublished(s: CmsStateModel): boolean {
    return s.homeUnpublished;
  }
  @Selector() static clients(s: CmsStateModel): CmsClient[] {
    return s.clients;
  }
  @Selector() static clientsUnpublished(s: CmsStateModel): boolean {
    return s.clientsUnpublished;
  }
  @Selector() static loading(s: CmsStateModel): boolean {
    return s.loading;
  }
  @Selector() static saving(s: CmsStateModel): boolean {
    return s.saving;
  }

  @Action(LoadCmsHome)
  loadHome(ctx: StateContext<CmsStateModel>) {
    ctx.patchState({ loading: true });
    return this.api.getHome().pipe(
      tap(({ data, unpublishedChanges }) =>
        ctx.patchState({ home: data, homeUnpublished: unpublishedChanges, ...busyOff }),
      ),
      catchError((err) => {
        ctx.patchState(busyOff);
        throw err;
      }),
    );
  }

  @Action(SaveCmsHome)
  saveHome(ctx: StateContext<CmsStateModel>, { payload }: SaveCmsHome) {
    ctx.patchState({ saving: true });
    return this.api.saveHome(payload).pipe(
      tap(({ data, unpublishedChanges }) =>
        ctx.patchState({ home: data, homeUnpublished: unpublishedChanges, ...busyOff }),
      ),
      catchError((err) => {
        ctx.patchState(busyOff);
        throw err;
      }),
    );
  }

  @Action(LoadCmsClients)
  loadClients(ctx: StateContext<CmsStateModel>) {
    ctx.patchState({ loading: true });
    return this.api.getClients().pipe(
      tap(({ data, unpublishedChanges }) =>
        ctx.patchState({ clients: data, clientsUnpublished: unpublishedChanges, ...busyOff }),
      ),
      catchError((err) => {
        ctx.patchState(busyOff);
        throw err;
      }),
    );
  }

  @Action(CreateCmsClient)
  createClient(ctx: StateContext<CmsStateModel>, { payload }: CreateCmsClient) {
    ctx.patchState({ saving: true });
    return this.api.createClient(payload).pipe(
      tap((client) =>
        ctx.patchState({
          clients: [...ctx.getState().clients, client],
          clientsUnpublished: true,
          ...busyOff,
        }),
      ),
      catchError((err) => {
        ctx.patchState(busyOff);
        throw err;
      }),
    );
  }

  @Action(UpdateCmsClient)
  updateClient(ctx: StateContext<CmsStateModel>, { id, payload }: UpdateCmsClient) {
    ctx.patchState({ saving: true });
    return this.api.updateClient(id, payload).pipe(
      tap((client) =>
        ctx.patchState({
          clients: ctx.getState().clients.map((c) => (c.id === id ? client : c)),
          clientsUnpublished: true,
          ...busyOff,
        }),
      ),
      catchError((err) => {
        ctx.patchState(busyOff);
        throw err;
      }),
    );
  }

  @Action(DeleteCmsClient)
  deleteClient(ctx: StateContext<CmsStateModel>, { id }: DeleteCmsClient) {
    ctx.patchState({ saving: true });
    return this.api.deleteClient(id).pipe(
      tap(() =>
        ctx.patchState({
          clients: ctx.getState().clients.filter((c) => c.id !== id),
          clientsUnpublished: true,
          ...busyOff,
        }),
      ),
      catchError((err) => {
        ctx.patchState(busyOff);
        throw err;
      }),
    );
  }

  @Action(PublishCms)
  publish(ctx: StateContext<CmsStateModel>, { section }: PublishCms) {
    ctx.patchState({ saving: true });
    return this.api.publish(section).pipe(
      tap(() =>
        ctx.patchState(
          section === 'home'
            ? { homeUnpublished: false, ...busyOff }
            : { clientsUnpublished: false, ...busyOff },
        ),
      ),
      catchError((err) => {
        ctx.patchState(busyOff);
        throw err;
      }),
    );
  }
}

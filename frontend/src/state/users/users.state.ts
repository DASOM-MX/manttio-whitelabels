import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { tap } from 'rxjs/operators';
import { UsersService } from '../../http/users.service';
import {
  LoadCurrentUser, LoadUsers, LoadUser, SelectUser,
  CreateUser, UpdateUser, DeleteUser,
} from './users.actions';
import type { PublicUser } from '../../app/data/dtos/user';

export interface UsersStateModel {
  entities: Record<string, PublicUser>;
  ids: string[];
  selectedId: string | null;
  loading: boolean;
  me: PublicUser | null;
}

@State<UsersStateModel>({
  name: 'users',
  defaults: { entities: {}, ids: [], selectedId: null, loading: false, me: null },
})
@Injectable()
export class UsersState {
  private readonly users = inject(UsersService);

  @Selector() static list(s: UsersStateModel): PublicUser[] {
    return s.ids.map((id) => s.entities[id]).filter(Boolean) as PublicUser[];
  }
  @Selector() static selected(s: UsersStateModel): PublicUser | null {
    return s.selectedId ? s.entities[s.selectedId] ?? null : null;
  }
  @Selector() static loading(s: UsersStateModel): boolean { return s.loading; }
  @Selector() static me(s: UsersStateModel): PublicUser | null { return s.me; }

  static byId(id: string) {
    return (s: UsersStateModel) => s.entities[id] ?? null;
  }

  @Action(LoadCurrentUser)
  loadCurrentUser(ctx: StateContext<UsersStateModel>) {
    return this.users.me().pipe(tap(({ user }) => ctx.patchState({ me: user })));
  }

  @Action(LoadUsers)
  loadList(ctx: StateContext<UsersStateModel>) {
    ctx.patchState({ loading: true });
    return this.users.list().pipe(
      tap(({ users }) => {
        const entities: Record<string, PublicUser> = {};
        const ids: string[] = [];
        for (const u of users) { entities[u.id] = u; ids.push(u.id); }
        ctx.patchState({ entities, ids, loading: false });
      }),
    );
  }

  @Action(LoadUser)
  loadOne(ctx: StateContext<UsersStateModel>, { id }: LoadUser) {
    return this.users.get(id).pipe(
      tap(({ user }) => {
        const s = ctx.getState();
        const ids = s.ids.includes(id) ? s.ids : [...s.ids, id];
        ctx.patchState({ entities: { ...s.entities, [id]: user }, ids });
      }),
    );
  }

  @Action(SelectUser)
  select(ctx: StateContext<UsersStateModel>, { id }: SelectUser) {
    ctx.patchState({ selectedId: id });
  }

  @Action(CreateUser)
  createUser(ctx: StateContext<UsersStateModel>, { payload }: CreateUser) {
    return this.users.create(payload).pipe(
      tap(({ user }) => {
        const s = ctx.getState();
        if (s.ids.includes(user.id)) return;
        ctx.patchState({
          entities: { ...s.entities, [user.id]: user },
          ids: [...s.ids, user.id],
        });
      }),
    );
  }

  @Action(UpdateUser)
  update(ctx: StateContext<UsersStateModel>, { id, payload }: UpdateUser) {
    return this.users.update(id, payload).pipe(
      tap(({ user }) => {
        const s = ctx.getState();
        ctx.patchState({ entities: { ...s.entities, [id]: user } });
      }),
    );
  }

  @Action(DeleteUser)
  remove(ctx: StateContext<UsersStateModel>, { id }: DeleteUser) {
    return this.users.remove(id).pipe(
      tap(() => {
        const s = ctx.getState();
        const { [id]: _gone, ...rest } = s.entities;
        ctx.patchState({
          entities: rest,
          ids: s.ids.filter((x) => x !== id),
          selectedId: s.selectedId === id ? null : s.selectedId,
        });
      }),
    );
  }
}

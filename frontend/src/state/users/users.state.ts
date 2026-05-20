import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { tap } from 'rxjs/operators';
import { UsersService } from '../../http/users.service';
import { LoadCurrentUser, CreateUser } from './users.actions';
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
  @Selector() static loading(s: UsersStateModel): boolean { return s.loading; }
  @Selector() static me(s: UsersStateModel): PublicUser | null { return s.me; }

  @Action(LoadCurrentUser)
  loadCurrentUser(ctx: StateContext<UsersStateModel>) {
    return this.users.me().pipe(tap(({ user }) => ctx.patchState({ me: user })));
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
}

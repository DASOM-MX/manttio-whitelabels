import { Injectable } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { LoadCurrentUser } from './users.actions';
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
  @Selector() static list(s: UsersStateModel): PublicUser[] {
    return s.ids.map((id) => s.entities[id]).filter(Boolean) as PublicUser[];
  }
  @Selector() static loading(s: UsersStateModel): boolean { return s.loading; }
  @Selector() static me(s: UsersStateModel): PublicUser | null { return s.me; }

  @Action(LoadCurrentUser)
  loadCurrentUser(_ctx: StateContext<UsersStateModel>) {
    // stub — wired up in PR #2 once UsersService exists
  }
}

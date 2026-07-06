import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { catchError, tap } from 'rxjs';
import { UsersService } from '../../http/users.service';
import {
  ClearTempPassword,
  CreateUser,
  DeleteUser,
  LoadUser,
  LoadUsers,
  ResetUserPassword,
  UpdateUser,
} from './users.actions';
import type { User, UserListQuery } from '../../app/data/dtos/user';

export interface UsersStateModel {
  items: User[];
  total: number;
  loading: boolean;
  selected: User | null;
  /** Last list query — replayed to refresh after mutations. */
  query: UserListQuery;
  /** One-time temp password from create/reset; cleared right after display. */
  tempPassword: string | null;
}

@State<UsersStateModel>({
  name: 'users',
  defaults: { items: [], total: 0, loading: false, selected: null, query: {}, tempPassword: null },
})
@Injectable()
export class UsersState {
  private readonly api = inject(UsersService);

  @Selector() static items(s: UsersStateModel): User[] {
    return s.items;
  }
  @Selector() static total(s: UsersStateModel): number {
    return s.total;
  }
  @Selector() static loading(s: UsersStateModel): boolean {
    return s.loading;
  }
  @Selector() static selected(s: UsersStateModel): User | null {
    return s.selected;
  }
  @Selector() static tempPassword(s: UsersStateModel): string | null {
    return s.tempPassword;
  }

  @Action(LoadUsers)
  loadUsers(ctx: StateContext<UsersStateModel>, { query }: LoadUsers) {
    ctx.patchState({ loading: true, query });
    return this.api.list(query).pipe(
      tap(({ items, total }) => ctx.patchState({ items, total, loading: false })),
      catchError((err) => {
        ctx.patchState({ loading: false });
        throw err;
      }),
    );
  }

  @Action(LoadUser)
  loadUser(ctx: StateContext<UsersStateModel>, { id }: LoadUser) {
    ctx.patchState({ selected: null });
    return this.api.get(id).pipe(tap((user) => ctx.patchState({ selected: user })));
  }

  @Action(CreateUser)
  createUser(ctx: StateContext<UsersStateModel>, { payload }: CreateUser) {
    return this.api
      .create(payload)
      .pipe(tap(({ user, tempPassword }) => ctx.patchState({ selected: user, tempPassword })));
  }

  @Action(UpdateUser)
  updateUser(ctx: StateContext<UsersStateModel>, { id, payload }: UpdateUser) {
    return this.api.update(id, payload).pipe(
      tap((user) =>
        ctx.patchState({
          selected: user,
          items: ctx.getState().items.map((u) => (u.id === id ? user : u)),
        }),
      ),
    );
  }

  @Action(DeleteUser)
  deleteUser(ctx: StateContext<UsersStateModel>, { id, payload }: DeleteUser) {
    return this.api.remove(id, payload).pipe(
      tap(() => {
        const s = ctx.getState();
        ctx.patchState({
          items: s.items.filter((u) => u.id !== id),
          total: Math.max(0, s.total - 1),
        });
      }),
    );
  }

  @Action(ResetUserPassword)
  resetPassword(ctx: StateContext<UsersStateModel>, { id }: ResetUserPassword) {
    return this.api
      .resetPassword(id)
      .pipe(tap(({ tempPassword }) => ctx.patchState({ tempPassword })));
  }

  @Action(ClearTempPassword)
  clearTempPassword(ctx: StateContext<UsersStateModel>) {
    ctx.patchState({ tempPassword: null });
  }
}

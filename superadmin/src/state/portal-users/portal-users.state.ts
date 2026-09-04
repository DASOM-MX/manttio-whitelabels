import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { catchError, tap } from 'rxjs';
import { PortalUsersService } from '../../app/services/http/portal-users.service';
import { InvitePortalUser, LoadPortalUsers } from './portal-users.actions';
import type { PortalUserListItem } from '../../app/data/dtos/portal-user/portal-user';

export interface PortalUsersStateModel {
  items: PortalUserListItem[];
  total: number;
  loading: boolean;
}

@State<PortalUsersStateModel>({
  name: 'portalUsers',
  defaults: { items: [], total: 0, loading: false },
})
@Injectable()
export class PortalUsersState {
  private readonly api = inject(PortalUsersService);

  @Selector() static items(s: PortalUsersStateModel): PortalUserListItem[] {
    return s.items;
  }
  @Selector() static total(s: PortalUsersStateModel): number {
    return s.total;
  }
  @Selector() static loading(s: PortalUsersStateModel): boolean {
    return s.loading;
  }

  @Action(LoadPortalUsers)
  loadPortalUsers(ctx: StateContext<PortalUsersStateModel>, { query }: LoadPortalUsers) {
    ctx.patchState({ loading: true });
    return this.api.list(query).pipe(
      tap(({ items, total }) => ctx.patchState({ items, total, loading: false })),
      catchError((err) => {
        ctx.patchState({ loading: false });
        throw err;
      }),
    );
  }

  /** No state to patch on success — the list page reloads its own page via
   *  `ListQueryService.refresh()` once the dialog reports back. */
  @Action(InvitePortalUser)
  invitePortalUser(_ctx: StateContext<PortalUsersStateModel>, { body }: InvitePortalUser) {
    return this.api.invite(body);
  }
}

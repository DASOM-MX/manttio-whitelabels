import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { catchError, tap } from 'rxjs';
import { PortalUsersService } from '../../app/services/http/portal-users.service';
import {
  InvitePortalUser,
  LoadPortalUser,
  LoadPortalUsers,
  ResetPortalUserPassword,
  ResumePortalUser,
  RevokePortalUserAccess,
  SuspendPortalUser,
  UpdatePortalUserGrants,
} from './portal-users.actions';
import { PortalUserStatus } from '../../app/model/enums/portal-user/portal-user-status.enum';
import type { PortalUserDetail, PortalUserListItem } from '../../app/data/dtos/portal-user/portal-user';

export interface PortalUsersStateModel {
  items: PortalUserListItem[];
  total: number;
  loading: boolean;
  /** The standalone grants editor's subject (26 CP-3) — a separate slice
   *  from `items`, which is one filtered page of the list. */
  selected: PortalUserDetail | null;
}

@State<PortalUsersStateModel>({
  name: 'portalUsers',
  defaults: { items: [], total: 0, loading: false, selected: null },
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
  @Selector() static selected(s: PortalUsersStateModel): PortalUserDetail | null {
    return s.selected;
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

  @Action(LoadPortalUser)
  loadPortalUser(ctx: StateContext<PortalUsersStateModel>, { id }: LoadPortalUser) {
    return this.api.get(id).pipe(tap((user) => ctx.patchState({ selected: user })));
  }

  /** Replaces the live grant list; the backend turns the diff into
   *  revoke/add rows, never a DELETE (26 §3), so this can't lose history. */
  @Action(UpdatePortalUserGrants)
  updatePortalUserGrants(
    ctx: StateContext<PortalUsersStateModel>,
    { id, grants }: UpdatePortalUserGrants,
  ) {
    return this.api.updateGrants(id, grants).pipe(
      tap((grants) => {
        const selected = ctx.getState().selected;
        if (selected && selected.id === id) ctx.patchState({ selected: { ...selected, grants } });
      }),
    );
  }

  /** Shared by "Reenviar invitación" and "Restablecer contraseña" (26 §4) —
   *  neither changes `status`, so there's nothing to patch here beyond the
   *  request itself; the toast at the call site tells them apart. */
  @Action(ResetPortalUserPassword)
  resetPortalUserPassword(_ctx: StateContext<PortalUsersStateModel>, { id }: ResetPortalUserPassword) {
    return this.api.resetPassword(id);
  }

  @Action(SuspendPortalUser)
  suspendPortalUser(ctx: StateContext<PortalUsersStateModel>, { id }: SuspendPortalUser) {
    return this.api.suspend(id).pipe(
      tap(() => {
        const selected = ctx.getState().selected;
        if (selected && selected.id === id) {
          ctx.patchState({ selected: { ...selected, status: PortalUserStatus.Suspended } });
        }
      }),
    );
  }

  @Action(ResumePortalUser)
  resumePortalUser(ctx: StateContext<PortalUsersStateModel>, { id }: ResumePortalUser) {
    return this.api.resume(id).pipe(
      tap(() => {
        const selected = ctx.getState().selected;
        if (selected && selected.id === id) {
          ctx.patchState({ selected: { ...selected, status: PortalUserStatus.Active } });
        }
      }),
    );
  }

  /** Soft delete (26 §4) — the record survives on the server; this clears
   *  `selected` because there is nothing left on this page to edit, and the
   *  component navigates back to the list. */
  @Action(RevokePortalUserAccess)
  revokePortalUserAccess(
    ctx: StateContext<PortalUsersStateModel>,
    { id, deleteComment }: RevokePortalUserAccess,
  ) {
    return this.api.revoke(id, deleteComment).pipe(
      tap(() => {
        const state = ctx.getState();
        if (state.selected?.id === id) ctx.patchState({ selected: null });
      }),
    );
  }
}

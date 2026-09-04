import type {
  InvitePortalUserRequest,
  PortalUserListQuery,
} from '../../app/data/dtos/portal-user/portal-user-requests';
import type { PortalGrant } from '../../app/model/enums/portal-user/portal-grant.enum';

export class LoadPortalUsers {
  static readonly type = '[Portal Users] Load List';
  constructor(public query: PortalUserListQuery = {}) {}
}

export class InvitePortalUser {
  static readonly type = '[Portal Users] Invite';
  constructor(public body: InvitePortalUserRequest) {}
}

export class LoadPortalUser {
  static readonly type = '[Portal Users] Load One';
  constructor(public id: string) {}
}

export class UpdatePortalUserGrants {
  static readonly type = '[Portal Users] Update Grants';
  constructor(
    public id: string,
    public grants: PortalGrant[],
    // Optional, no default (26 §3b, PR #215) — omitted leaves is_admin
    // untouched on the row; the detail page always passes its current value.
    public isAdmin?: boolean,
  ) {}
}

/** Shared by "Reenviar invitación" and "Restablecer contraseña" — one
 *  backend action, two lifecycle-row contexts (26 §4). */
export class ResetPortalUserPassword {
  static readonly type = '[Portal Users] Reset Password';
  constructor(public id: string) {}
}

export class SuspendPortalUser {
  static readonly type = '[Portal Users] Suspend';
  constructor(public id: string) {}
}

export class ResumePortalUser {
  static readonly type = '[Portal Users] Resume';
  constructor(public id: string) {}
}

/** Soft delete, required comment — the permanent one (26 §4). */
export class RevokePortalUserAccess {
  static readonly type = '[Portal Users] Revoke Access';
  constructor(
    public id: string,
    public deleteComment: string,
  ) {}
}

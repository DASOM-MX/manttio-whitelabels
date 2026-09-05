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
  ) {}
}

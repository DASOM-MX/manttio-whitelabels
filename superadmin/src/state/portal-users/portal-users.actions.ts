import type {
  InvitePortalUserRequest,
  PortalUserListQuery,
} from '../../app/data/dtos/portal-user/portal-user-requests';

export class LoadPortalUsers {
  static readonly type = '[Portal Users] Load List';
  constructor(public query: PortalUserListQuery = {}) {}
}

export class InvitePortalUser {
  static readonly type = '[Portal Users] Invite';
  constructor(public body: InvitePortalUserRequest) {}
}

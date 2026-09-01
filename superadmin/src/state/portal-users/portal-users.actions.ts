import type { PortalUserListQuery } from '../../app/data/dtos/portal-user/portal-user-requests';

export class LoadPortalUsers {
  static readonly type = '[Portal Users] Load List';
  constructor(public query: PortalUserListQuery = {}) {}
}

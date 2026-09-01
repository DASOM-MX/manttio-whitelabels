import { Pipe, PipeTransform } from '@angular/core';
import { PortalUserStatus } from '../model/enums/portal-user/portal-user-status.enum';
import type { PortalUserListItem } from '../data/dtos/portal-user/portal-user';

/** An invite that was never used (26 §1) — an access request that silently
 *  failed, and the row staff most need to spot. */
@Pipe({ name: 'portalInviteUnused' })
export class PortalInviteUnusedPipe implements PipeTransform {
  transform(user: PortalUserListItem): boolean {
    return user.status === PortalUserStatus.Invited && !user.lastLoginAt;
  }
}

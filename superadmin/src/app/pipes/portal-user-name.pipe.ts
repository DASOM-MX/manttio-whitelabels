import { Pipe, PipeTransform } from '@angular/core';
import type { PortalUserListItem } from '../data/dtos/portal-user/portal-user';

/** The contact's display name. Surnames are null on most rows — the invite
 *  copies whatever the contact carried — so they are joined, not padded. */
@Pipe({ name: 'portalUserName' })
export class PortalUserNamePipe implements PipeTransform {
  transform(user: PortalUserListItem): string {
    return [user.name, user.paternalLastName, user.maternalLastName].filter(Boolean).join(' ');
  }
}

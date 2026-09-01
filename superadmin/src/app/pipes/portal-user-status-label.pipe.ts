import { Pipe, PipeTransform } from '@angular/core';
import { PORTAL_USER_STATUS_LABELS } from '../model/constants/portal-user/portal-user-status-labels.const';
import type { PortalUserStatus } from '../model/enums/portal-user/portal-user-status.enum';

@Pipe({ name: 'portalUserStatusLabel' })
export class PortalUserStatusLabelPipe implements PipeTransform {
  transform(status: PortalUserStatus): string {
    return PORTAL_USER_STATUS_LABELS[status];
  }
}

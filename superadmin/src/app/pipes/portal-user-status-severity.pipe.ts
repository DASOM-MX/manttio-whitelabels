import { Pipe, PipeTransform } from '@angular/core';
import { PORTAL_USER_STATUS_SEVERITIES } from '../model/constants/portal-user/portal-user-status-severities.const';
import type { PortalUserStatus } from '../model/enums/portal-user/portal-user-status.enum';

@Pipe({ name: 'portalUserStatusSeverity' })
export class PortalUserStatusSeverityPipe implements PipeTransform {
  transform(
    status: PortalUserStatus,
  ): 'secondary' | 'info' | 'success' | 'warn' | 'danger' | 'contrast' {
    return PORTAL_USER_STATUS_SEVERITIES[status];
  }
}

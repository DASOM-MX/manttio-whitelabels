import { Pipe, PipeTransform } from '@angular/core';
import { PORTAL_GRANT_LABELS } from '../model/constants/portal-user/portal-grant-labels.const';
import type { PortalGrant } from '../model/enums/portal-user/portal-grant.enum';

@Pipe({ name: 'portalGrantLabel' })
export class PortalGrantLabelPipe implements PipeTransform {
  transform(grant: PortalGrant): string {
    return PORTAL_GRANT_LABELS[grant];
  }
}

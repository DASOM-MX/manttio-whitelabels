import { Pipe, PipeTransform } from '@angular/core';
import { PORTAL_GRANT_HELPER_TEXT } from '../model/constants/portal-user/portal-grant-helper-text.const';
import type { PortalGrant } from '../model/enums/portal-user/portal-grant.enum';

@Pipe({ name: 'portalGrantHelperText' })
export class PortalGrantHelperTextPipe implements PipeTransform {
  transform(grant: PortalGrant): string {
    return PORTAL_GRANT_HELPER_TEXT[grant];
  }
}

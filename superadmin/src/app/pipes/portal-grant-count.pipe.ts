import { Pipe, PipeTransform } from '@angular/core';
import type { PortalGrant } from '../model/enums/portal-user/portal-grant.enum';

/** "3 permisos" for the list cell. The eight labels rendered as chips wrapped
 *  to four lines and blew out the row height; the full set is one click away in
 *  the grants editor. Zero is handled by the template, which marks it plainly
 *  rather than as "0 permisos" (26 §3). */
@Pipe({ name: 'portalGrantCount' })
export class PortalGrantCountPipe implements PipeTransform {
  transform(grants: PortalGrant[] | null | undefined): string {
    const n = grants?.length ?? 0;
    return `${n} ${n === 1 ? 'permiso' : 'permisos'}`;
  }
}

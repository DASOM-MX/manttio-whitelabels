import { Pipe, PipeTransform } from '@angular/core';
import { canManageUser } from '../access';
import type { Role } from '../data/dtos/auth';

/** Owner-protection row gating as a pure pipe: `user.role | canManage`.
 *  Actor-independent — owner rows are immutable in-tenant for everyone. */
@Pipe({ name: 'canManage' })
export class CanManagePipe implements PipeTransform {
  transform(targetRole: Role): boolean {
    return canManageUser(targetRole);
  }
}

import { Pipe, PipeTransform } from '@angular/core';
import { canManageUser } from '../access';
import type { Role } from '../data/dtos/auth';

/** Owner-protection row gating as a pure pipe: `user.role | canManage: myRole()`. */
@Pipe({ name: 'canManage' })
export class CanManagePipe implements PipeTransform {
  transform(targetRole: Role, actorRole: Role | null): boolean {
    return canManageUser(actorRole, targetRole);
  }
}

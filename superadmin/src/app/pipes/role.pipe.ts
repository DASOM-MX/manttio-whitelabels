import { Pipe, PipeTransform } from '@angular/core';
import { ROLE_LABELS } from '../model/constants/user/role-labels.const';
import { ROLE_SEVERITIES } from '../model/constants/user/role-severities.const';
import type { Role } from '../data/dtos/auth';

/** Pure per-row role mappings (01 Angular: no method calls in templates). */

@Pipe({ name: 'roleLabel' })
export class RoleLabelPipe implements PipeTransform {
  transform(role: Role): string {
    return ROLE_LABELS[role];
  }
}

@Pipe({ name: 'roleSeverity' })
export class RoleSeverityPipe implements PipeTransform {
  transform(role: Role): 'warn' | 'info' | 'secondary' | 'success' {
    return ROLE_SEVERITIES[role];
  }
}

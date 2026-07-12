import { Pipe, PipeTransform } from '@angular/core';
import { ROLE_LABELS } from '../model/constants/user/role-labels.const';
import { ROLE_PILL_CLASSES } from '../model/constants/user/role-pill-classes.const';
import type { Role } from '../data/dtos/auth';

/** Pure per-row role mappings (01 Angular: no method calls in templates). */

@Pipe({ name: 'roleLabel' })
export class RoleLabelPipe implements PipeTransform {
  transform(role: Role): string {
    return ROLE_LABELS[role];
  }
}

/** Color classes for the blue hierarchy ladder — use on a `.role-pill`. */
@Pipe({ name: 'rolePillClass' })
export class RolePillClassPipe implements PipeTransform {
  transform(role: Role): string {
    return ROLE_PILL_CLASSES[role];
  }
}

import { Pipe, PipeTransform } from '@angular/core';
import { VISIT_STATUS_LABELS } from '../model/constants/visit/visit-status-labels.const';
import { VISIT_STATUS_SEVERITIES } from '../model/constants/visit/visit-status-severities.const';
import type { VisitStatus } from '../model/enums/visit/visit-status.enum';

/** Pure per-row status mappings (no method calls in templates). */

@Pipe({ name: 'visitStatusLabel' })
export class VisitStatusLabelPipe implements PipeTransform {
  transform(status: VisitStatus): string {
    return VISIT_STATUS_LABELS[status];
  }
}

@Pipe({ name: 'visitStatusSeverity' })
export class VisitStatusSeverityPipe implements PipeTransform {
  transform(status: VisitStatus): 'info' | 'warn' | 'success' | 'contrast' {
    return VISIT_STATUS_SEVERITIES[status];
  }
}

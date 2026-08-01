import { Pipe, PipeTransform } from '@angular/core';
import { VISIT_STATUS_LABELS } from '../model/constants/visit/visit-status-labels.const';
import { VISIT_STATUS_SEVERITIES } from '../model/constants/visit/visit-status-severities.const';
import { VISIT_CLOSE_REASON_LABELS } from '../model/constants/visit/visit-close-reason-labels.const';
import { VISIT_CHIP_CLASSES } from '../model/constants/visit/visit-chip-classes.const';
import { TECHNICIAN_DOT_PALETTE } from '../model/constants/visit/technician-dot-palette.const';
import type { VisitCloseReason } from '../model/enums/visit/visit-close-reason.enum';
import type { VisitStatus } from '../model/enums/visit/visit-status.enum';

/** Pure per-chip mappings (01 Angular: no method calls in templates). */

@Pipe({ name: 'visitStatusLabel' })
export class VisitStatusLabelPipe implements PipeTransform {
  transform(status: VisitStatus): string {
    return VISIT_STATUS_LABELS[status];
  }
}

@Pipe({ name: 'visitStatusSeverity' })
export class VisitStatusSeverityPipe implements PipeTransform {
  transform(status: VisitStatus): 'info' | 'success' | 'secondary' {
    return VISIT_STATUS_SEVERITIES[status];
  }
}

@Pipe({ name: 'visitCloseReasonLabel' })
export class VisitCloseReasonLabelPipe implements PipeTransform {
  transform(reason: VisitCloseReason): string {
    return VISIT_CLOSE_REASON_LABELS[reason];
  }
}

@Pipe({ name: 'visitChipClass' })
export class VisitChipClassPipe implements PipeTransform {
  transform(status: VisitStatus): string {
    return VISIT_CHIP_CLASSES[status];
  }
}

/** Stable per-technician identity dot, hash-picked from the fixed palette by
 *  user id (05 ask — hash-derived in v1). No id = unassigned = hollow dot. */
@Pipe({ name: 'technicianDotClass' })
export class TechnicianDotClassPipe implements PipeTransform {
  transform(technicianId: string | undefined): string {
    if (!technicianId) {
      return 'border border-dashed border-surface-400 bg-transparent dark:border-surface-500';
    }
    let hash = 0;
    for (let i = 0; i < technicianId.length; i++) {
      hash = (hash * 31 + technicianId.charCodeAt(i)) >>> 0;
    }
    return TECHNICIAN_DOT_PALETTE[hash % TECHNICIAN_DOT_PALETTE.length];
  }
}

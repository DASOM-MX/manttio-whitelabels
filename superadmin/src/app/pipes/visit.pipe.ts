import { Pipe, PipeTransform } from '@angular/core';
import { VISIT_STATUS_LABELS } from '../model/constants/visit/visit-status-labels.const';
import { VISIT_STATUS_SEVERITIES } from '../model/constants/visit/visit-status-severities.const';
import { VISIT_CLOSE_REASON_LABELS } from '../model/constants/visit/visit-close-reason-labels.const';
import { VISIT_BLOCK_CLASSES } from '../model/constants/visit/visit-block-classes.const';
import { TECHNICIAN_DOT_PALETTE } from '../model/constants/visit/technician-dot-palette.const';
import { formatDurationMinutes } from '../data/utils';
import type { Visit } from '../data/dtos/visit';
import type { VisitCloseReason } from '../model/enums/visit/visit-close-reason.enum';
import type { VisitStatus } from '../model/enums/visit/visit-status.enum';

/** Pure per-block mappings (01 Angular: no method calls in templates). */

@Pipe({ name: 'visitStatusLabel' })
export class VisitStatusLabelPipe implements PipeTransform {
  transform(status: VisitStatus): string {
    return VISIT_STATUS_LABELS[status];
  }
}

@Pipe({ name: 'visitStatusSeverity' })
export class VisitStatusSeverityPipe implements PipeTransform {
  transform(status: VisitStatus): 'info' | 'warn' | 'success' | 'secondary' {
    return VISIT_STATUS_SEVERITIES[status];
  }
}

@Pipe({ name: 'visitCloseReasonLabel' })
export class VisitCloseReasonLabelPipe implements PipeTransform {
  transform(reason: VisitCloseReason): string {
    return VISIT_CLOSE_REASON_LABELS[reason];
  }
}

@Pipe({ name: 'visitBlockClass' })
export class VisitBlockClassPipe implements PipeTransform {
  transform(status: VisitStatus): string {
    return VISIT_BLOCK_CLASSES[status];
  }
}

@Pipe({ name: 'visitDuration' })
export class VisitDurationPipe implements PipeTransform {
  transform(minutes: number): string {
    return formatDurationMinutes(minutes);
  }
}

/** The block's hover text. A block in a busy column may be too narrow to show
 *  more than a time, so everything needed to recognize the visit — its code, the
 *  order it serves, who is on it — lives one hover away. */
@Pipe({ name: 'visitTooltip' })
export class VisitTooltipPipe implements PipeTransform {
  transform(visit: Visit): string {
    return [
      visit.internalCode,
      visit.serviceOrderFolio,
      visit.customerName,
      visit.technicianName ?? 'Sin asignar',
      formatDurationMinutes(visit.actualDurationMinutes ?? visit.expectedDurationMinutes),
    ]
      .filter(Boolean)
      .join(' · ');
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

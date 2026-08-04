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

/** The visit hover card (owner 2026-08-03): who the visit serves, what the job
 *  is, and the expected window — labeled rows fed to `pTooltip` with
 *  `[escape]="false"` wherever a visit renders as a hoverable item (week/day
 *  blocks, month chips). An HTML string from a pure pipe rather than a
 *  TemplateRef so the block loops stay free of per-item `ng-template`
 *  boilerplate; the phone agenda skips the card — touch has no hover and a tap
 *  already opens the dialog.
 *
 *  `escape=false` means every interpolated field MUST pass `escapeHtml` — the
 *  labels are literals, the data is tenant input. */
@Pipe({ name: 'visitHoverCard' })
export class VisitHoverCardPipe implements PipeTransform {
  transform(visit: Visit): string {
    // `scheduledEnd` is backend-derived but optional on pre-CP-1b rows; the
    // projection start + duration is byte-identical to what the backend writes.
    const back = visit.scheduledEnd
      ? new Date(visit.scheduledEnd)
      : new Date(
          new Date(visit.scheduledStart).getTime() + visit.expectedDurationMinutes * 60_000,
        );
    return [
      '<div class="grid gap-1 text-xs">',
      row('Cliente', escapeHtml(visit.customerName ?? '—')),
      row('Servicio', escapeHtml(visit.title ?? '—')),
      row('Hora esperada de llegada', clock(new Date(visit.scheduledStart))),
      row('Hora esperada de regreso', clock(back)),
      '</div>',
    ].join('');
  }
}

const row = (label: string, value: string): string =>
  `<p><span class="font-medium">${label}:</span> ${value}</p>`;

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** `1:00pm`, matching how the schedule reads out loud — no locale registered,
 *  so the `date` pipe's meridiem would come out in English anyway. */
const clock = (date: Date): string => {
  const hours = ((date.getHours() + 11) % 12) + 1;
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `<span class="font-data">${hours}:${minutes}${date.getHours() < 12 ? 'am' : 'pm'}</span>`;
};

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

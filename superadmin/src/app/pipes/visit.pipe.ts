import { Pipe, PipeTransform } from '@angular/core';
import { VISIT_STATUS_LABELS } from '../model/constants/visit/visit-status-labels.const';
import { VISIT_STATUS_SEVERITIES } from '../model/constants/visit/visit-status-severities.const';
import { VISIT_CLOSE_REASON_LABELS } from '../model/constants/visit/visit-close-reason-labels.const';
import { VISIT_BLOCK_CLASSES } from '../model/constants/visit/visit-block-classes.const';
import { TECHNICIAN_DOT_PALETTE } from '../model/constants/visit/technician-dot-palette.const';
import { SERVICE_ORDER_PRIORITY_LABELS } from '../model/constants/service-order/service-order-priority-labels.const';
import { SERVICE_ORDER_PRIORITY_FLAG_CLASSES } from '../model/constants/service-order/service-order-priority-flag-classes.const';
import { formatDurationMinutes } from '../data/utils';
import { ServiceOrderPriority } from '../model/enums/service-order/service-order-priority.enum';
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

/** The rungs that mark the slot itself. `low`/`normal` draw nothing — marking
 *  every slot would drown the one signal the marker exists for; the hover card
 *  still names all five. */
const SLOT_FLAG_PRIORITIES: readonly ServiceOrderPriority[] = [
  ServiceOrderPriority.Medium,
  ServiceOrderPriority.High,
  ServiceOrderPriority.Urgent,
];

/** Color for the slot's corner flag (owner 2026-08-04): the same filled lucide
 *  flag the orders list flies, same yellow → red ladder — one visual language
 *  for priority everywhere it shows. Empty string below `medium`; the templates
 *  guard on the result, so those slots render no marker element at all. */
@Pipe({ name: 'visitPriorityFlagClass' })
export class VisitPriorityFlagClassPipe implements PipeTransform {
  transform(priority: ServiceOrderPriority | undefined): string {
    if (!priority || !SLOT_FLAG_PRIORITIES.includes(priority)) return '';
    return SERVICE_ORDER_PRIORITY_FLAG_CLASSES[priority];
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
      // The priority row only exists when the order carries one — a
      // transition-era unbound visit has no order to inherit urgency from.
      visit.serviceOrderPriority ? row('Prioridad', priorityFlag(visit.serviceOrderPriority)) : '',
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

/** The lucide `flag` outline, inlined: the hover card is an HTML string, so the
 *  `lucideFlag` directive cannot reach it. Same filled-flag treatment and the
 *  same baby-blue → red ladder as the orders list; the label itself stays in
 *  the tooltip's own text color, the glyph does the signaling. */
const FLAG_PATH =
  'M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528';

const priorityFlag = (priority: ServiceOrderPriority): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ` +
  `class="inline size-3.5 shrink-0 align-text-bottom fill-current ${SERVICE_ORDER_PRIORITY_FLAG_CLASSES[priority]}">` +
  `<path d="${FLAG_PATH}"/></svg> ${SERVICE_ORDER_PRIORITY_LABELS[priority]}`;

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

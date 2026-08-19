import { Pipe, PipeTransform } from '@angular/core';
import type { LucideIcon } from '@lucide/angular';
import { QUOTATION_EVENT_ICONS } from '../model/constants/quotation/quotation-event-icons.const';
import { QUOTATION_EVENT_LABELS } from '../model/constants/quotation/quotation-event-labels.const';
import { QUOTATION_STATUS_LABELS } from '../model/constants/quotation/quotation-status-labels.const';
import { QuotationEventType } from '../model/enums/quotation/quotation-event-type.enum';
import { QuotationResponse } from '../model/enums/quotation/quotation-response.enum';
import { QuotationStatus } from '../model/enums/quotation/quotation-status.enum';
import type { QuotationEvent } from '../data/dtos/quotation/quotation-event';

const RESPONSE_VERBS: Record<QuotationResponse, string> = {
  [QuotationResponse.Approved]: 'Aprobó',
  [QuotationResponse.Declined]: 'Rechazó',
};

/** `changes` is `Record<string, unknown>` on the wire, so every read is a
 *  narrowing one — an event written by an older backend must degrade to a
 *  blank cell, never to `undefined → undefined`. */
const statusLabel = (value: unknown): string | null =>
  typeof value === 'string' && value in QUOTATION_STATUS_LABELS
    ? QUOTATION_STATUS_LABELS[value as QuotationStatus]
    : null;

const responseVerb = (value: unknown): string | null =>
  typeof value === 'string' && value in RESPONSE_VERBS
    ? RESPONSE_VERBS[value as QuotationResponse]
    : null;

@Pipe({ name: 'quotationEventLabel' })
export class QuotationEventLabelPipe implements PipeTransform {
  transform(type: QuotationEventType): string {
    return QUOTATION_EVENT_LABELS[type];
  }
}

@Pipe({ name: 'quotationEventIcon' })
export class QuotationEventIconPipe implements PipeTransform {
  transform(type: QuotationEventType): LucideIcon {
    return QUOTATION_EVENT_ICONS[type];
  }
}

/** Who did it. Exactly one of the two is ever set: staff actions carry
 *  `actorName`, token-page actions carry `contactName`. */
@Pipe({ name: 'quotationEventActor' })
export class QuotationEventActorPipe implements PipeTransform {
  transform(event: QuotationEvent): string {
    return event.actorName ?? event.contactName ?? 'Sistema';
  }
}

/** The detail cell.
 *
 *  A reviewer's answer is composed rather than falling back to `note`: the note
 *  holds only their decline reason, and showing that alone would print the
 *  motive without the verdict. A **mind-change** reads as "Aprobó (antes
 *  Rechazó)" — that flip is the whole reason responses are re-logged instead of
 *  overwritten (20 §5). */
@Pipe({ name: 'quotationEventDetail' })
export class QuotationEventDetailPipe implements PipeTransform {
  transform(event: QuotationEvent): string {
    const changes = event.changes ?? {};

    if (event.type === QuotationEventType.ReviewerResponded) {
      const verb = responseVerb(changes['response']);
      if (!verb) return event.note ?? '—';
      const previous = responseVerb(changes['previousResponse']);
      const head = previous ? `${verb} (antes ${previous.toLowerCase()})` : verb;
      return event.note ? `${head} — ${event.note}` : head;
    }

    if (event.type === QuotationEventType.StatusDerived) {
      const from = statusLabel(changes['from']);
      const to = statusLabel(changes['to']);
      return from && to ? `${from} → ${to}` : (to ?? '—');
    }

    if (event.type === QuotationEventType.Sent && typeof changes['email'] === 'string') {
      const target = changes['isReviewer'] ? `${changes['email']} (revisor)` : changes['email'];
      return event.note ? `${target} — ${event.note}` : target;
    }

    return event.note ?? '—';
  }
}

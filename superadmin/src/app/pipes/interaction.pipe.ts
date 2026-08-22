import { Pipe, PipeTransform } from '@angular/core';
import {
  LucideActivity,
  LucideMail,
  LucideMapPin,
  LucideMessageCircle,
  LucidePhone,
  LucideStickyNote,
  type LucideIcon,
} from '@lucide/angular';
import { INTERACTION_TYPE_LABELS } from '../model/constants/interaction/interaction-type-labels.const';
import { INTERACTION_REF_LABELS } from '../model/constants/interaction/interaction-ref-labels.const';
import { INTERACTION_REF_ROUTES } from '../model/constants/interaction/interaction-ref-routes.const';
import type { InteractionRef, InteractionType } from '../data/dtos/interaction';

const ICONS: Record<InteractionType, LucideIcon> = {
  note: LucideStickyNote,
  call: LucidePhone,
  whatsapp: LucideMessageCircle,
  email: LucideMail,
  visit: LucideMapPin,
  system: LucideActivity,
};

@Pipe({ name: 'interactionTypeLabel' })
export class InteractionTypeLabelPipe implements PipeTransform {
  transform(type: InteractionType): string {
    return INTERACTION_TYPE_LABELS[type];
  }
}

@Pipe({ name: 'interactionTypeIcon' })
export class InteractionTypeIconPipe implements PipeTransform {
  transform(type: InteractionType): LucideIcon {
    return ICONS[type];
  }
}

/** Overdue follow-up check (08 §3) — red pill when the date is past. */
@Pipe({ name: 'isOverdue' })
export class IsOverduePipe implements PipeTransform {
  transform(iso: string | undefined | null): boolean {
    if (!iso) return false;
    return iso.slice(0, 10) < new Date().toISOString().slice(0, 10);
  }
}

/** The `routerLink` a timeline entry's `ref` points at, or null when the kind
 *  has nowhere to go (`status_change` refers back to the client you are on;
 *  `bill` has no module yet). Keeping route assembly in a pipe is what lets the
 *  template stay a single `@if` over every ref kind. */
@Pipe({ name: 'interactionRefLink' })
export class InteractionRefLinkPipe implements PipeTransform {
  transform(ref: InteractionRef | undefined): string[] | null {
    const base = ref && INTERACTION_REF_ROUTES[ref.kind];
    return base && ref ? [base, ref.id] : null;
  }
}

@Pipe({ name: 'interactionRefLabel' })
export class InteractionRefLabelPipe implements PipeTransform {
  transform(ref: InteractionRef | undefined): string | null {
    return (ref && INTERACTION_REF_LABELS[ref.kind]) ?? null;
  }
}

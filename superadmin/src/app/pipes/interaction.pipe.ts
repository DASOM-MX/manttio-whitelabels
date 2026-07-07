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
import type { InteractionType } from '../data/dtos/interaction';

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

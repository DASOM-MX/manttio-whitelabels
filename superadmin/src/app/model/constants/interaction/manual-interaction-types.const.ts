import type { InteractionType } from '../../../data/dtos/interaction';

/** Composer-selectable types — `system` is backend-only, never offered (08 §2). */
export const MANUAL_INTERACTION_TYPES: Exclude<InteractionType, 'system'>[] = [
  'note',
  'call',
  'whatsapp',
  'email',
  'visit',
];

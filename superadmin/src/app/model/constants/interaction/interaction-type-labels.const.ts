import type { InteractionType } from '../../../data/dtos/interaction';

export const INTERACTION_TYPE_LABELS: Record<InteractionType, string> = {
  note: 'Nota',
  call: 'Llamada',
  whatsapp: 'WhatsApp',
  email: 'Correo',
  visit: 'Visita',
  system: 'Sistema',
};

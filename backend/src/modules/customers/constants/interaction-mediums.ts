import { InteractionType } from '../enums/interactions.enum';

// Spanish medium phrase (article + noun + preposition) per interaction type,
// composed into the client_interaction_registered notification body:
// "<actor> registró <phrase> <customer>." Keyed over the full enum for
// exhaustiveness — `system` entries never notify through the composer path.
export const INTERACTION_MEDIUM_PHRASES: Record<InteractionType, string> = {
  [InteractionType.Note]: 'una nota sobre',
  [InteractionType.Call]: 'una llamada con',
  [InteractionType.Whatsapp]: 'un mensaje de WhatsApp con',
  [InteractionType.Email]: 'un correo con',
  [InteractionType.Visit]: 'una visita con',
  [InteractionType.System]: 'una interacción con',
};

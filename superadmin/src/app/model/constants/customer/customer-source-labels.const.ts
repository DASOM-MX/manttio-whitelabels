import type { CustomerSource } from '../../../data/dtos/customer';

// Verbatim parity with the backend's CUSTOMER_SOURCE_LABELS (it composes
// system timeline bodies from the same strings).
export const CUSTOMER_SOURCE_LABELS: Record<CustomerSource, string> = {
  facebook: 'Facebook',
  google: 'Google',
  referral: 'Referido',
  website: 'Sitio web',
  phonecall: 'Llamada',
  personal_meeting: 'Reunión personal',
  other: 'Otro',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  whatsapp: 'WhatsApp',
};

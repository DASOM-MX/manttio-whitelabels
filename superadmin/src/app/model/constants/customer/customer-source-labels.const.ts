import type { CustomerSource } from '../../../data/dtos/customer';

export const CUSTOMER_SOURCE_LABELS: Record<CustomerSource, string> = {
  facebook: 'Facebook',
  google: 'Google',
  referral: 'Referido',
  website: 'Sitio web',
  phonecall: 'Llamada',
  personal_meeting: 'Reunión personal',
  other: 'Otro',
};

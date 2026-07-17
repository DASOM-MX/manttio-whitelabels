import { CustomerSource } from '../enums/customers.enum';

// Spanish source labels — used to compose `system` timeline entry bodies so
// they read the same as the UI (superadmin CUSTOMER_SOURCE_LABELS; the last
// three arrive only via share-link utm_source and exceed the superadmin map).
export const CUSTOMER_SOURCE_LABELS: Record<CustomerSource, string> = {
  [CustomerSource.Facebook]: 'Facebook',
  [CustomerSource.Google]: 'Google',
  [CustomerSource.Referral]: 'Referido',
  [CustomerSource.Website]: 'Sitio web',
  [CustomerSource.Phonecall]: 'Llamada',
  [CustomerSource.PersonalMeeting]: 'Reunión personal',
  [CustomerSource.Other]: 'Otro',
  [CustomerSource.Instagram]: 'Instagram',
  [CustomerSource.Tiktok]: 'TikTok',
  [CustomerSource.Whatsapp]: 'WhatsApp',
};

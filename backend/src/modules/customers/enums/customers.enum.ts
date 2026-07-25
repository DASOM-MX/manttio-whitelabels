/** CRM status + acquisition source for a customer (07 §3 / 08). String-valued
 *  TS enums so call sites read `status === CustomerStatus.Lead`; the DB columns
 *  are `text` narrowed via `.$type<>()` and guarded by a CHECK constraint, and
 *  request bodies validate with `z.nativeEnum(...)`. Values mirror the
 *  superadmin frontend enum exactly (superadmin/src/app/data/dtos/customer.ts). */

export enum CustomerStatus {
  Lead = 'lead',
  Active = 'active',
  Disabled = 'disabled',
  Blacklisted = 'blacklisted',
}

// Instagram/Tiktok/Whatsapp exceed the superadmin picker: they arrive via the
// share links' utm_source (leads.service deriveSource), never hand-picked.
export enum CustomerSource {
  Facebook = 'facebook',
  Google = 'google',
  Referral = 'referral',
  Website = 'website',
  Phonecall = 'phonecall',
  PersonalMeeting = 'personal_meeting',
  Other = 'other',
  Instagram = 'instagram',
  Tiktok = 'tiktok',
  Whatsapp = 'whatsapp',
}

export enum ClientType {
  Person = 'person',
  Business = 'business',
}

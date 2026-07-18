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

export enum CustomerSource {
  Facebook = 'facebook',
  Google = 'google',
  Referral = 'referral',
  Website = 'website',
  Phonecall = 'phonecall',
  PersonalMeeting = 'personal_meeting',
  Other = 'other',
}

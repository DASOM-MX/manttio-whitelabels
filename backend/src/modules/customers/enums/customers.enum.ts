// CRM classification for a client (superadmin plan 07 §1; UI in 08). Enums so
// services compare against named members (`status === CustomerStatus.Blacklisted`)
// rather than magic strings; the string values are what the DB persists.
export enum CustomerStatus {
  Active = 'active',
  Lead = 'lead',
  Disabled = 'disabled',
  Blacklisted = 'blacklisted',
}

// Where the client came from (07 §1). `referral` is the only value that pairs
// with `referredByCustomerId`.
export enum CustomerSource {
  Facebook = 'facebook',
  Google = 'google',
  Referral = 'referral',
  Website = 'website',
  Phonecall = 'phonecall',
  PersonalMeeting = 'personal_meeting',
  Other = 'other',
}

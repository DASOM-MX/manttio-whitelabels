/** Portal login lifecycle (26 §1, client-portal 01 §1). `Invited` means the
 *  temp password was mailed and never used yet; `Suspended` is the reversible
 *  block — revoked access is a soft delete and leaves the list entirely. */
export enum PortalUserStatus {
  Invited = 'invited',
  Active = 'active',
  Suspended = 'suspended',
}

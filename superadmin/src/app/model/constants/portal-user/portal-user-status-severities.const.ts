import { PortalUserStatus } from '../../enums/portal-user/portal-user-status.enum';

/** p-tag severities per status — pills always pair color with a label.
 *  `Suspended` takes `warn` rather than `danger`: the block is reversible and
 *  the record stays, unlike a revoked access. */
export const PORTAL_USER_STATUS_SEVERITIES: Record<
  PortalUserStatus,
  'secondary' | 'info' | 'success' | 'warn' | 'danger' | 'contrast'
> = {
  [PortalUserStatus.Invited]: 'info',
  [PortalUserStatus.Active]: 'success',
  [PortalUserStatus.Suspended]: 'warn',
};

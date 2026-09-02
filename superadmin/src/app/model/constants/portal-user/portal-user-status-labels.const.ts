import { PortalUserStatus } from '../../enums/portal-user/portal-user-status.enum';

export const PORTAL_USER_STATUS_LABELS: Record<PortalUserStatus, string> = {
  [PortalUserStatus.Invited]: 'Invitado',
  [PortalUserStatus.Active]: 'Activo',
  [PortalUserStatus.Suspended]: 'Suspendido',
};

import type { MeResponse } from '../data/dtos/auth';

/** Default landing route per role (02 §4): owner/admin/office → dashboard;
 *  technicians → their reports. Flip technicians to '/calendar' once module
 *  12 ships — landing them on its stub page helps nobody. */
export const defaultRouteFor = (me: MeResponse | null): string => {
  if (!me) return '/login';
  return me.role === 'technician' ? '/reports' : '/dashboard';
};

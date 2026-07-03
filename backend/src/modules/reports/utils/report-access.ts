import type { AuthUser } from '../../../env';
import type { ReportRow } from '../types/reports.types';

// Authorization predicate: admins may access every report; technicians only the
// reports assigned to them. Used by the read/patch/sign/pictures flows.
export const canAccess = (user: AuthUser, report: ReportRow) =>
  user.role === 'admin' || report.assignedTo === user.id;

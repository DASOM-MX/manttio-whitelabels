import type { AuthUser } from '../../../env';
import { isAdminTier } from '../../auth/utils/role-tier';
import type { ReportRow } from '../types/reports.types';

// Authorization predicate: the admin tier (owner/admin) may access every report;
// technicians only the reports assigned to them. Used by the read/patch/sign/
// pictures flows.
export const canAccess = (user: AuthUser, report: ReportRow) =>
  isAdminTier(user) || report.assignedTo === user.id;

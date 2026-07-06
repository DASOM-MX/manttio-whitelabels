import type { Role } from '../../../data/dtos/auth';
import type { ModuleKey } from '../../../access';

/** Access matrix (14-access-control.md §2) — roles that may enter each module.
 *  In-page action gating (e.g. admin read-only on branding, office draft-only
 *  on billing/contracts) stays inside each module via `hasRole`. */
export const MODULE_ROLES: Record<ModuleKey, readonly Role[]> = {
  dashboard: ['owner', 'admin', 'office'],
  users: ['owner', 'admin'],
  reports: ['owner', 'admin', 'office', 'technician'],
  templates: ['owner', 'admin'],
  customers: ['owner', 'admin', 'office'],
  equipment: ['owner', 'admin', 'office'],
  calendar: ['owner', 'admin', 'office', 'technician'],
  contracts: ['owner', 'admin', 'office'],
  billing: ['owner', 'admin', 'office'],
  branding: ['owner', 'admin'],
  cms: ['owner', 'admin'],
  wms: ['owner', 'admin', 'office', 'technician'],
};

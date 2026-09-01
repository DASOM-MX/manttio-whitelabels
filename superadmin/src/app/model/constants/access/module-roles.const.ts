import type { Role } from '../../../data/dtos/auth';
import { OWNER_ONLY } from '../../../guards/owner-only.guard';
import type { ModuleKey } from '../../../data/types/access/module-key.type';

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
  // Read-wide (18 §2): office and technician both work from the catalog and
  // see prices. Writes stay owner/admin, gated in-page — so the page renders
  // read-only for the other two rather than being route-blocked.
  services: ['owner', 'admin', 'office', 'technician'],
  // No technician row at all (20 §7) — not even read. Pricing and margin are
  // commercial information, and the field app never needs them. Delete stays
  // admin-tier, gated in-page.
  quotations: ['owner', 'admin', 'office'],
  // Read-wide (19 §3): technicians reach an order as context from their
  // assigned reports — the route admits them, the nav never shows it (their
  // TECH_NAV has no entry) and the API strips money from what they see.
  'service-orders': ['owner', 'admin', 'office', 'technician'],
  calendar: ['owner', 'admin', 'office', 'technician'],
  contracts: ['owner', 'admin', 'office'],
  billing: ['owner', 'admin', 'office'],
  branding: ['owner', 'admin'],
  cms: ['owner', 'admin'],
  wms: ['owner', 'admin', 'office', 'technician'],
  // Owner-only (26 CP-1): the roster of every external login is held
  // closer than the module's per-user actions, which are admin-tier.
  'portal-users': OWNER_ONLY,
};

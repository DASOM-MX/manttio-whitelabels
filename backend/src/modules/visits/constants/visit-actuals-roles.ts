import type { Role } from '../../users/enums/users.enum';

/** Who may correct the actual times on a terminal visit (12 §2, owner
 *  2026-07-31). Admin-tier only — deliberately narrower than every other visit
 *  gate, which admits `office` too.
 *
 *  Office schedules the work; rewriting what a technician recorded as *done* is
 *  a billing-grade edit and belongs with the roles that answer for the invoice.
 *  Spelled out here rather than reusing `ADMIN_TIER` so the reason travels with
 *  the rule and a future change to the generic tier can't silently widen it. */
export const VISIT_ACTUALS_ROLES: Role[] = ['owner', 'admin'];

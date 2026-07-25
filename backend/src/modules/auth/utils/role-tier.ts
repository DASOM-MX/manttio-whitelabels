import type { AuthUser } from '../../../env';

// The admin tier: owner outranks admin, so every admin surface admits both.
// Gates name their allow-list explicitly (`requireRole(['owner', 'admin'])`);
// inline role branches use the predicate, never `role === 'admin'` — that
// would silently drop owners into the technician branch (auto-scoping,
// access denials).
export const ADMIN_TIER: AuthUser['role'][] = ['owner', 'admin'];

export const isAdminTier = (user: AuthUser) => ADMIN_TIER.includes(user.role);

// The back-office tier: everyone who works the business side (owner, admin,
// office) as opposed to the field. Where `ADMIN_TIER` gates *authority*, this
// gates *commercial visibility* — internal numbers office needs to quote and
// invoice with, but that don't belong on a technician's screen. First use:
// `services.cost` (18 §2).
//
// Stated as an allow-list, never as `role !== 'technician'` — a negative check
// would silently admit any role added later, which is the wrong default for a
// confidentiality gate.
export const BACK_OFFICE_TIER: AuthUser['role'][] = ['owner', 'admin', 'office'];

export const isBackOfficeTier = (user: AuthUser) => BACK_OFFICE_TIER.includes(user.role);

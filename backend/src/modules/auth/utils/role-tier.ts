import type { AuthUser } from '../../../env';

// The admin tier: owner outranks admin, so every admin surface admits both.
// Gates name their allow-list explicitly (`requireRole(['owner', 'admin'])`);
// inline role branches use the predicate, never `role === 'admin'` — that
// would silently drop owners into the technician branch (auto-scoping,
// access denials).
export const ADMIN_TIER: AuthUser['role'][] = ['owner', 'admin'];

export const isAdminTier = (user: AuthUser) => ADMIN_TIER.includes(user.role);

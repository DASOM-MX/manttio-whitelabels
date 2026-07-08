import type { AuthUser } from '../../../env';

// Role hierarchy: owner > admin > (office) > technician. Inline role checks
// must use the tier predicate, never `role === 'admin'` — otherwise owners
// silently fall into the technician branch (auto-scoping, access denials).
export const isAdminTier = (user: AuthUser) => user.role === 'owner' || user.role === 'admin';

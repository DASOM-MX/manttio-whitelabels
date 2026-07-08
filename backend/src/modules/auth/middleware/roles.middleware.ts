import type { MiddlewareHandler } from 'hono';
import type { AppBindings, AuthUser } from '../../../env';

// Role hierarchy: `owner` sits above `admin` and passes every gate (decided
// 2026-07-07 — backend plan §1). Call sites therefore list the *minimum* role
// tier (`requireRole('admin')`), never 'owner' explicitly. Owner-specific
// protections (no owner-row mutations) live in the services, not here.
export const requireRole = (...roles: AuthUser['role'][]): MiddlewareHandler<AppBindings> => {
  return async (c, next) => {
    const user = c.get('user');
    if (!user || (user.role !== 'owner' && !roles.includes(user.role))) {
      return c.json({ error: 'forbidden' }, 403);
    }
    await next();
  };
};

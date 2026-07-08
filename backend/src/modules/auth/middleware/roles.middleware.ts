import type { MiddlewareHandler } from 'hono';
import type { AppBindings, AuthUser } from '../../../env';

// Gates take an explicit allow-list — no implicit hierarchy (decided
// 2026-07-07). Every route names exactly the roles it admits; `owner`
// outranks `admin` in the product, so it appears wherever `admin` does
// (via ADMIN_TIER), but nothing passes a gate it isn't listed on.
// Owner-specific protections (no owner-row mutations) live in the services.
export const requireRole = (roles: AuthUser['role'][]): MiddlewareHandler<AppBindings> => {
  return async (c, next) => {
    const user = c.get('user');
    if (!user || !roles.includes(user.role)) {
      return c.json({ error: 'forbidden' }, 403);
    }
    await next();
  };
};

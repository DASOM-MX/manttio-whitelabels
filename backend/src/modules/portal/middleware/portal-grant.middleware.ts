import type { MiddlewareHandler } from 'hono';
import type { AppBindings } from '../../../env';
import type { PortalGrant } from '../enums/portal-grants.enum';

/**
 * Require a single grant on a route. Missing grant is 404 for anything
 * record-shaped — the portal must not confirm that a section or record exists
 * to someone not entitled to it (02 §4).
 */
export const requireGrant = (grant: PortalGrant): MiddlewareHandler<AppBindings> => {
  return async (c, next) => {
    const user = c.get('portalUser');
    if (!user || !user.grants.includes(grant)) {
      return c.json({ error: 'not_found' }, 404);
    }
    await next();
  };
};

/**
 * Require one of several grants on a route. Used for `/portal/equipment`,
 * which accepts either `view_equipment` or `create_service_requests` (A8).
 * Missing all grants is 404.
 */
export const requireAnyGrant = (...grants: PortalGrant[]): MiddlewareHandler<AppBindings> => {
  return async (c, next) => {
    const user = c.get('portalUser');
    if (!user || !grants.some((g) => user.grants.includes(g))) {
      return c.json({ error: 'not_found' }, 404);
    }
    await next();
  };
};

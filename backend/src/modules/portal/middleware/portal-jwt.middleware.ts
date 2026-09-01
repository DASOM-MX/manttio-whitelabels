import type { MiddlewareHandler } from 'hono';
import { jwtVerify } from 'jose';
import type { AppBindings, PortalUser } from '../../../env';
import { createDb } from '../../database/client';
import { findPortalUserById, findGrantsByPortalUser } from '../repository/portal-users.repository';
import type { PortalGrant } from '../enums/portal-grants.enum';
import { PortalUserStatus } from '../enums/portal-users.enum';

/**
 * Portal JWT middleware — second auth surface with a separate secret (00 §3.8).
 *
 * Verifies the token against PORTAL_JWT_SECRET, loads the portal user, their grants
 * and isAdmin flag per request, and 401s if the user is suspended or soft-deleted.
 */
export const portalJwtMiddleware: MiddlewareHandler<AppBindings> = async (c, next) => {
  const header = c.req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const token = header.slice('Bearer '.length);
  const secret = new TextEncoder().encode(c.env.PORTAL_JWT_SECRET);

  // Try only the JWT verification and claim checks; DB failures should surface as 5xx
  let sub: string;
  let cid: string;
  try {
    const { payload } = await jwtVerify(token, secret);
    const rawSub = payload.sub;
    const rawCid = payload.cid;
    const typ = payload.typ;

    if (typeof rawSub !== 'string' || typeof rawCid !== 'string' || typ !== 'portal') {
      return c.json({ error: 'unauthorized' }, 401);
    }

    sub = rawSub;
    cid = rawCid;
  } catch {
    return c.json({ error: 'unauthorized' }, 401);
  }

  // Load the portal user from the DB — it must exist, not be suspended, and
  // not be soft-deleted. A DB failure here surfaces as 5xx, not silently as 401.
  const db = createDb(c.env.DATABASE_URL);
  const portalUser = await findPortalUserById(db, sub);
  if (!portalUser) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  if (
    portalUser.status === PortalUserStatus.Suspended ||
    portalUser.deletedAt !== null
  ) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  // Load active grants (revoked_at is null).
  const grantRows = await findGrantsByPortalUser(db, sub);
  const grants = grantRows.map((g) => g.grant) as PortalGrant[];

  const contextUser: PortalUser = {
    id: portalUser.id,
    contactId: portalUser.contactId,
    customerId: portalUser.customerId,
    email: portalUser.email,
    isAdmin: portalUser.isAdmin,
    grants,
  };

  c.set('portalUser', contextUser);

  await next();
};

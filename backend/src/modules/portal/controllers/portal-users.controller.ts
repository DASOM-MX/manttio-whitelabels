import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings, AuthUser } from '../../../env';
import { createDb } from '../../database/client';
import { requireRole } from '../../auth/middleware/roles.middleware';
import { listPortalUsersQuerySchema } from '../validators/portal-users-query.validator';
import { ADMIN_TIER } from '../../auth/utils/role-tier';
import {
  invitePortalUserSchema,
  updatePortalUserGrantsSchema,
  deletePortalUserSchema,
} from '../validators/portal-users.validator';
import {
  listPortalUsers,
  invitePortalUser,
  updatePortalUserGrants,
  suspendPortalUser,
  resumePortalUser,
  resetPortalUserPassword,
  revokePortalUserAccess,
  getPortalUserForAdmin,
  ContactNotFoundError,
  ContactHasNoEmailError,
  PortalUserAlreadyExistsError,
  PortalUserNotFoundError,
} from '../services/portal-users.service';

// The roster read is owner-only — narrower than the ADMIN_TIER gate every other
// route on this controller uses. See the GET handler for why.
const OWNER_ONLY: AuthUser['role'][] = ['owner'];

export const portalUsers = new Hono<AppBindings>();

const idSchema = z.string().uuid();

/**
 * POST /portal-users — invite a contact to become a portal user.
 * Staff-only. Creates portal_users row, grants rows, and sends invite email.
 * The temp password is sent via email only, never in the response.
 */
/**
 * GET /portal-users — tenant-wide portal-access list (superadmin 26 §1).
 *
 * **Owner only**, deliberately narrower than the rest of this controller. Every
 * other route here acts on one portal user you already navigated to; this one
 * enumerates every external person with access to the tenant's documents, in a
 * single readable page, across all customers. That roster is the thing an
 * owner wants held closest.
 */
portalUsers.get(
  '/',
  requireRole(OWNER_ONLY),
  zValidator('query', listPortalUsersQuerySchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    return c.json(await listPortalUsers(db, c.req.valid('query')));
  },
);

portalUsers.post('/', requireRole(ADMIN_TIER), zValidator('json', invitePortalUserSchema), async (c) => {
  const actor = c.get('user');
  const db = createDb(c.env.DATABASE_URL);
  const input = c.req.valid('json');

  try {
    const result = await invitePortalUser(db, c.env, actor, input.contactId, input.grants, input.isAdmin);
    return c.json(result, 201);
  } catch (err) {
    if (err instanceof ContactNotFoundError) {
      return c.json({ error: 'contact_not_found', message: 'The specified contact does not exist' }, 404);
    }
    if (err instanceof ContactHasNoEmailError) {
      return c.json(
        { error: 'contact_has_no_email', message: 'The contact has no email address on file' },
        400,
      );
    }
    if (err instanceof PortalUserAlreadyExistsError) {
      return c.json(
        { error: 'portal_user_exists', message: 'A portal user already exists for this contact' },
        409,
      );
    }
    throw err;
  }
});

/**
 * GET /portal-users/:id — get a portal user for staff admin purposes.
 * Includes status, grants, and is_admin flag.
 */
portalUsers.get('/:id', requireRole(ADMIN_TIER), async (c) => {
  const id = idSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'not_found' }, 404);

  const db = createDb(c.env.DATABASE_URL);
  const user = await getPortalUserForAdmin(db, id.data);
  if (!user) return c.json({ error: 'not_found' }, 404);

  return c.json({ user });
});

/**
 * PATCH /portal-users/:id/grants — update a portal user's grants.
 * Revokes grants not in the new list, adds grants in the new list.
 * `isAdmin` is optional (owner, 2026-09-04): sent, it writes `is_admin`
 * directly; omitted, the column is left exactly as it was.
 */
portalUsers.patch(
  '/:id/grants',
  requireRole(ADMIN_TIER),
  zValidator('json', updatePortalUserGrantsSchema),
  async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'not_found' }, 404);

    const actor = c.get('user');
    const db = createDb(c.env.DATABASE_URL);
    const input = c.req.valid('json');

    try {
      const result = await updatePortalUserGrants(db, actor, id.data, input.grants, input.isAdmin);
      return c.json(result);
    } catch (err) {
      if (err instanceof PortalUserNotFoundError) {
        return c.json({ error: 'not_found' }, 404);
      }
      throw err;
    }
  },
);

/**
 * PATCH /portal-users/:id/suspend — suspend a portal user (prevent login).
 */
portalUsers.patch('/:id/suspend', requireRole(ADMIN_TIER), async (c) => {
  const id = idSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'not_found' }, 404);

  const db = createDb(c.env.DATABASE_URL);
  const suspended = await suspendPortalUser(db, id.data);
  if (!suspended) return c.json({ error: 'not_found' }, 404);

  return c.json({ suspended: true });
});

/**
 * PATCH /portal-users/:id/resume — resume a suspended portal user.
 */
portalUsers.patch('/:id/resume', requireRole(ADMIN_TIER), async (c) => {
  const id = idSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'not_found' }, 404);

  const db = createDb(c.env.DATABASE_URL);
  const resumed = await resumePortalUser(db, id.data);
  if (!resumed) return c.json({ error: 'not_found' }, 404);

  return c.json({ resumed: true });
});

/**
 * POST /portal-users/:id/password — staff-issued password reset.
 * Generates a new temporary password and sends it via email.
 * The temp password is never included in the response.
 */
portalUsers.post('/:id/password', requireRole(ADMIN_TIER), async (c) => {
  const id = idSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'not_found' }, 404);

  const db = createDb(c.env.DATABASE_URL);

  try {
    const result = await resetPortalUserPassword(db, c.env, id.data);
    return c.json(result);
  } catch (err) {
    if (err instanceof PortalUserNotFoundError) {
      return c.json({ error: 'not_found' }, 404);
    }
    throw err;
  }
});

/**
 * DELETE /portal-users/:id — revoke portal access (soft delete).
 * The row stays; deletedAt and deletedBy are set for the audit trail.
 * Optional comment persisted to delete_comment.
 */
portalUsers.delete(
  '/:id',
  requireRole(ADMIN_TIER),
  zValidator('json', deletePortalUserSchema),
  async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'not_found' }, 404);

    const actor = c.get('user');
    const db = createDb(c.env.DATABASE_URL);
    const input = c.req.valid('json');

    const revoked = await revokePortalUserAccess(db, actor, id.data, input.deleteComment);
    if (!revoked) return c.json({ error: 'not_found' }, 404);

    return c.json({ id: id.data, deleted: true });
  },
);

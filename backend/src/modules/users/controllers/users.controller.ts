import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { requireRole } from '../../auth/middleware/roles.middleware';
import {
  createUserSchema,
  deleteUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
} from '../validators/users.validator';
import {
  CannotDeleteSelfError,
  CannotModifyOwnerError,
  CannotResetPasswordError,
  EmailInUseError,
  createUser,
  editUser,
  getUserById,
  getUsersPaged,
  removeUser,
  resetUserPassword,
} from '../services/users.service';

export const users = new Hono<AppBindings>();

// The PK is a uuid, so a malformed :id can never match a row — 404 it up front
// instead of letting Postgres throw on the cast (uncaught 500). Also what old
// clients hitting the retired /users/list path see now.
const idSchema = z.string().uuid();

// `GET /users/me` is available to any authenticated user — registered before the
// admin gate so it bypasses `requireRole(['owner', 'admin'])`.
users.get('/me', async (c) => {
  const me = c.get('user');
  const db = createDb(c.env.DATABASE_URL);
  const user = await getUserById(db, me.id);
  if (!user) return c.json({ error: 'not_found' }, 404);
  return c.json({ user });
});

// Paged roster read (05 §3) — the one list endpoint; the legacy /users/list
// alias retired 2026-07-28. Admits office too: the service-order builder
// assigns technicians, and office creates orders (19 §5). User *management*
// below stays owner/admin.
users.get(
  '/',
  requireRole(['owner', 'admin', 'office']),
  zValidator('query', listUsersQuerySchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    return c.json(await getUsersPaged(db, c.req.valid('query')));
  },
);

users.use('*', requireRole(['owner', 'admin']));

users.get('/:id', async (c) => {
  const id = idSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'not_found' }, 404);
  const db = createDb(c.env.DATABASE_URL);
  const user = await getUserById(db, id.data);
  if (!user) return c.json({ error: 'not_found' }, 404);
  return c.json({ user });
});

users.post('/', zValidator('json', createUserSchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  try {
    // `tempPassword` (temp-password model) appears in this response only —
    // it is never retrievable again.
    const result = await createUser(db, c.req.valid('json'));
    return c.json(result, 201);
  } catch (err) {
    if (err instanceof EmailInUseError) return c.json({ error: 'email_in_use' }, 409);
    throw err;
  }
});

// Role-gated password reset (backend plan §1): the service enforces the
// actor→target pairing; the temp password in the response is shown once.
users.post('/:id/password', async (c) => {
  const id = idSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'not_found' }, 404);
  const me = c.get('user');
  const db = createDb(c.env.DATABASE_URL);
  try {
    const result = await resetUserPassword(db, me, id.data);
    if (!result) return c.json({ error: 'not_found' }, 404);
    return c.json(result);
  } catch (err) {
    if (err instanceof CannotResetPasswordError) {
      return c.json({ error: 'cannot_reset_password' }, 403);
    }
    throw err;
  }
});

users.patch('/:id', zValidator('json', updateUserSchema), async (c) => {
  const id = idSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'not_found' }, 404);
  const db = createDb(c.env.DATABASE_URL);
  try {
    const user = await editUser(db, id.data, c.req.valid('json'));
    if (!user) return c.json({ error: 'not_found' }, 404);
    return c.json({ user });
  } catch (err) {
    if (err instanceof EmailInUseError) return c.json({ error: 'email_in_use' }, 409);
    if (err instanceof CannotModifyOwnerError) return c.json({ error: 'cannot_modify_owner' }, 403);
    throw err;
  }
});

users.delete('/:id', zValidator('json', deleteUserSchema), async (c) => {
  const id = idSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'not_found' }, 404);
  const me = c.get('user');
  const { deleteComment } = c.req.valid('json');
  const db = createDb(c.env.DATABASE_URL);
  try {
    const row = await removeUser(db, id.data, me.id, deleteComment);
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json({ id: row.id, deleted: true });
  } catch (err) {
    if (err instanceof CannotDeleteSelfError) return c.json({ error: 'cannot_delete_self' }, 400);
    if (err instanceof CannotModifyOwnerError) return c.json({ error: 'cannot_modify_owner' }, 403);
    throw err;
  }
});

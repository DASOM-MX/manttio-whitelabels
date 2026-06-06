import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../env';
import { createDb } from '../db/client';
import {
  findUserById,
  insertUser,
  listUsers,
  softDeleteUser,
  toPublicUser,
  updateUser,
  type UpdateUserFields,
} from '../db/repositories/users';
import { hashPassword } from '../lib/password';
import { isUniqueViolation } from '../lib/db-errors';
import { requireRole } from '../middleware/roles';
import { createUserSchema, deleteUserSchema, updateUserSchema } from '../validators/users';

export const users = new Hono<AppBindings>();

// `GET /users/me` is available to any authenticated user — registered before the
// admin gate so it bypasses `requireRole('admin')`.
users.get('/me', async (c) => {
  const me = c.get('user');
  const db = createDb(c.env.DATABASE_URL);
  const user = await findUserById(db, me.id);
  if (!user) return c.json({ error: 'not_found' }, 404);
  return c.json({ user: toPublicUser(user) });
});

users.use('*', requireRole('admin'));

users.get('/list', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const rows = await listUsers(db);
  return c.json({ users: rows.map(toPublicUser) });
});

users.get('/:id', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const user = await findUserById(db, c.req.param('id'));
  if (!user) return c.json({ error: 'not_found' }, 404);
  return c.json({ user: toPublicUser(user) });
});

users.post('/', zValidator('json', createUserSchema), async (c) => {
  const input = c.req.valid('json');
  const db = createDb(c.env.DATABASE_URL);

  const passwordHash = await hashPassword(input.password);
  try {
    const row = await insertUser(db, {
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
    });
    return c.json({ user: toPublicUser(row) }, 201);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return c.json({ error: 'email_in_use' }, 409);
    }
    throw err;
  }
});

users.patch('/:id', zValidator('json', updateUserSchema), async (c) => {
  const id = c.req.param('id');
  const input = c.req.valid('json');
  const db = createDb(c.env.DATABASE_URL);

  const fields: UpdateUserFields = {};
  if (input.name !== undefined) fields.name = input.name;
  if (input.email !== undefined) fields.email = input.email;
  if (input.role !== undefined) fields.role = input.role;
  if (input.password !== undefined) fields.passwordHash = await hashPassword(input.password);

  try {
    const row = await updateUser(db, id, fields);
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json({ user: toPublicUser(row) });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return c.json({ error: 'email_in_use' }, 409);
    }
    throw err;
  }
});

users.delete('/:id', zValidator('json', deleteUserSchema), async (c) => {
  const id = c.req.param('id');
  const me = c.get('user');
  if (me.id === id) {
    return c.json({ error: 'cannot_delete_self' }, 400);
  }

  const { deleteComment } = c.req.valid('json');
  const db = createDb(c.env.DATABASE_URL);
  const row = await softDeleteUser(db, id, deleteComment, me.id);
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json({ id: row.id, deleted: true });
});

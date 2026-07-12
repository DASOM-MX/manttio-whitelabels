import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { requireRole } from '../../auth/middleware/roles.middleware';
import { CustomerNotFoundError } from '../http-errors/customer-not-found.error';
import { createContactSchema, updateContactSchema } from '../validators/contacts.validator';
import { addContact, editContact, getContact, removeContact } from '../services/contacts.service';

// Top-level `/contacts` resource — single-record entity ops addressed by the
// contact's own uuid. Listing a client's contacts lives under its parent
// (`GET /customers/:id/contacts`). Reads open to any authed user; writes
// owner/admin.
export const contacts = new Hono<AppBindings>();

contacts.get('/:id', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const row = await getContact(db, c.req.param('id'));
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json(row);
});

contacts.post('/', requireRole(['owner', 'admin']), zValidator('json', createContactSchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  try {
    const row = await addContact(db, c.req.valid('json'));
    return c.json(row, 201);
  } catch (err) {
    if (err instanceof CustomerNotFoundError) return c.json({ error: 'customer_not_found' }, 404);
    throw err;
  }
});

contacts.patch(
  '/:id',
  requireRole(['owner', 'admin']),
  zValidator('json', updateContactSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    const row = await editContact(db, c.req.param('id'), c.req.valid('json'));
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json(row);
  },
);

contacts.delete('/:id', requireRole(['owner', 'admin']), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const row = await removeContact(db, c.req.param('id'));
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json({ id: row.id, deleted: true });
});

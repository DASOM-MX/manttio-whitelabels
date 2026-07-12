import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { requireRole } from '../../auth/middleware/roles.middleware';
import {
  createCustomerSchema,
  deleteCustomerSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from '../validators/customers.validator';
import {
  createCustomer,
  editCustomer,
  getCustomerById,
  getCustomers,
  removeCustomer,
} from '../services/customers.service';

export const customers = new Hono<AppBindings>();

// Read endpoints are open to any authenticated user (admins + technicians).
// Paged when `page`/`limit` are supplied; full active list otherwise (the main
// frontend calls this with no params and relies on getting everything).
customers.get('/', zValidator('query', listCustomersQuerySchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const { customers: list, total, page, limit } = await getCustomers(db, c.req.valid('query'));
  return c.json({ customers: list, total, page, limit });
});

customers.get('/:id', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const row = await getCustomerById(db, c.req.param('id'));
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json({ customer: row });
});

// Write endpoints are owner/admin.
customers.post('/', requireRole(['owner', 'admin']), zValidator('json', createCustomerSchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const row = await createCustomer(db, c.req.valid('json'));
  return c.json({ customer: row }, 201);
});

customers.patch(
  '/:id',
  requireRole(['owner', 'admin']),
  zValidator('json', updateCustomerSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    const row = await editCustomer(db, c.req.param('id'), c.req.valid('json'));
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json({ customer: row });
  },
);

// The audit comment is optional (superadmin sends it, the main frontend deletes
// with no body), so we can't use zValidator('json') — an empty body would be
// rejected as malformed JSON. Parse defensively, then validate via the schema.
customers.delete('/:id', requireRole(['owner', 'admin']), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const me = c.get('user');
  const raw = await c.req.json().catch(() => ({}));
  const parsed = deleteCustomerSchema.safeParse(raw);
  if (!parsed.success) return c.json({ error: 'invalid_request', message: 'invalid delete body' }, 400);
  const row = await removeCustomer(db, c.req.param('id'), me.id, parsed.data.deleteComment ?? null);
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json({ id: row.id, deleted: true });
});

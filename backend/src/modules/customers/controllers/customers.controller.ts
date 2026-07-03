import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { requireRole } from '../../auth/middleware/roles.middleware';
import { createCustomerSchema, updateCustomerSchema } from '../validators/customers.validator';
import {
  createCustomer,
  editCustomer,
  getCustomerById,
  getCustomers,
  removeCustomer,
} from '../services/customers.service';

export const customers = new Hono<AppBindings>();

// Read endpoints are open to any authenticated user (admins + technicians).
customers.get('/', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  return c.json({ customers: await getCustomers(db) });
});

customers.get('/:id', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const row = await getCustomerById(db, c.req.param('id'));
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json({ customer: row });
});

// Write endpoints are admin-only.
customers.post('/', requireRole('admin'), zValidator('json', createCustomerSchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const row = await createCustomer(db, c.req.valid('json'));
  return c.json({ customer: row }, 201);
});

customers.patch(
  '/:id',
  requireRole('admin'),
  zValidator('json', updateCustomerSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    const row = await editCustomer(db, c.req.param('id'), c.req.valid('json'));
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json({ customer: row });
  },
);

customers.delete('/:id', requireRole('admin'), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const row = await removeCustomer(db, c.req.param('id'));
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json({ id: row.id, deleted: true });
});

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../env';
import { createDb } from '../db/client';
import {
  deleteCustomer,
  findCustomerById,
  insertCustomer,
  listCustomers,
  updateCustomer,
  type UpdateCustomerFields,
} from '../db/repositories/customers';
import { requireRole } from '../middleware/roles';
import { createCustomerSchema, updateCustomerSchema } from '../validators/customers';

export const customers = new Hono<AppBindings>();

// Read endpoints are open to any authenticated user (admins + technicians).
customers.get('/', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const rows = await listCustomers(db);
  return c.json({ customers: rows });
});

customers.get('/:id', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const row = await findCustomerById(db, c.req.param('id'));
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json({ customer: row });
});

// Write endpoints are admin-only.
customers.post('/', requireRole('admin'), zValidator('json', createCustomerSchema), async (c) => {
  const input = c.req.valid('json');
  const db = createDb(c.env.DATABASE_URL);
  const row = await insertCustomer(db, input);
  return c.json({ customer: row }, 201);
});

customers.patch(
  '/:id',
  requireRole('admin'),
  zValidator('json', updateCustomerSchema),
  async (c) => {
    const id = c.req.param('id');
    const input = c.req.valid('json');
    const db = createDb(c.env.DATABASE_URL);

    const fields: UpdateCustomerFields = {};
    if (input.name !== undefined) fields.name = input.name;
    if (input.identification !== undefined) fields.identification = input.identification;
    if (input.phone !== undefined) fields.phone = input.phone;
    if (input.email !== undefined) fields.email = input.email;
    if (input.observation !== undefined) fields.observation = input.observation;
    if (input.address !== undefined) fields.address = input.address;
    if (input.state !== undefined) fields.state = input.state;
    if (input.razonSocial !== undefined) fields.razonSocial = input.razonSocial;

    const row = await updateCustomer(db, id, fields);
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json({ customer: row });
  },
);

customers.delete('/:id', requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const db = createDb(c.env.DATABASE_URL);

  const row = await deleteCustomer(db, id);
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json({ id: row.id, deleted: true });
});

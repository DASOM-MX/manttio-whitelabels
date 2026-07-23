import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { isForeignKeyViolation } from '../../database/db-errors';
import { requireRole } from '../../auth/middleware/roles.middleware';
import {
  createContractSchema,
  deleteContractSchema,
  listContractsQuerySchema,
  updateContractSchema,
} from '../validators/contracts.validator';
import {
  createContract,
  editContract,
  getContractById,
  getContracts,
  removeContract,
} from '../services/contracts.service';

export const contracts = new Hono<AppBindings>();

// Contracts are back-office filing (13 §2): owner/admin/office read and write;
// deletes are admin-tier; technicians have no access at all.

contracts.get(
  '/',
  requireRole(['owner', 'admin', 'office']),
  zValidator('query', listContractsQuerySchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    return c.json(await getContracts(db, c.req.valid('query')));
  },
);

contracts.get('/:id', requireRole(['owner', 'admin', 'office']), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const row = await getContractById(db, c.req.param('id'));
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json(row);
});

contracts.post(
  '/',
  requireRole(['owner', 'admin', 'office']),
  zValidator('json', createContractSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    try {
      const row = await createContract(db, c.req.valid('json'));
      return c.json(row, 201);
    } catch (err) {
      if (isForeignKeyViolation(err)) return c.json({ error: 'invalid_customer' }, 400);
      throw err;
    }
  },
);

contracts.patch(
  '/:id',
  requireRole(['owner', 'admin', 'office']),
  zValidator('json', updateContractSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    try {
      const row = await editContract(db, c.req.param('id'), c.req.valid('json'));
      if (!row) return c.json({ error: 'not_found' }, 404);
      return c.json(row);
    } catch (err) {
      if (isForeignKeyViolation(err)) return c.json({ error: 'invalid_customer' }, 400);
      throw err;
    }
  },
);

contracts.delete(
  '/:id',
  requireRole(['owner', 'admin']),
  zValidator('json', deleteContractSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    const { deleteComment } = c.req.valid('json');
    const row = await removeContract(db, c.req.param('id'), deleteComment, c.get('user').id);
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json({ id: row.id, deleted: true });
  },
);

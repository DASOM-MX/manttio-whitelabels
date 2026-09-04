import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { UUID_PARAM } from '../../shared/constants/uuid-param';
import { PortalGrant } from '../enums/portal-grants.enum';
import { requireGrant } from '../middleware/portal-grant.middleware';
import { portalJwtMiddleware } from '../middleware/portal-jwt.middleware';
import {
  downloadContractForPortal,
  getContractForPortal,
  listContractsForPortal,
} from '../services/portal-contracts.service';
import { portalContractsQuerySchema } from '../validators/portal-reads.validator';

// Contratos (04 §4). Scope is the token's customer on every route.
export const portalContracts = new Hono<AppBindings>();

portalContracts.use('*', portalJwtMiddleware);
portalContracts.use('*', requireGrant(PortalGrant.ViewContracts));

portalContracts.get('/', zValidator('query', portalContractsQuerySchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const user = c.get('portalUser');
  return c.json(await listContractsForPortal(db, user.customerId, c.req.valid('query')));
});

// Named `/pdf` for the common case, but the stored file is not always one
// (04 §2b) — the response carries the document's own mime and filename. Every
// fetch appends a `contract_events` row inside the transaction that clears it.
portalContracts.get(`/:id{${UUID_PARAM}}/pdf`, async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const user = c.get('portalUser');
  const file = await downloadContractForPortal(
    db,
    c.env.MANTTIO_CONTRACTS,
    user,
    c.req.param('id'),
  );
  if (!file) return c.json({ error: 'not_found' }, 404);

  return new Response(file.body, {
    status: 200,
    headers: {
      'content-type': file.fileMime,
      'content-disposition': `attachment; filename="${file.fileName}"`,
      'cache-control': 'private, no-store',
    },
  });
});

portalContracts.get(`/:id{${UUID_PARAM}}`, async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const user = c.get('portalUser');
  const contract = await getContractForPortal(db, user.customerId, c.req.param('id'));
  if (!contract) return c.json({ error: 'not_found' }, 404);
  return c.json(contract);
});

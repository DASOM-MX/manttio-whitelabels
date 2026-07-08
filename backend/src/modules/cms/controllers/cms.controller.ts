import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { requireRole } from '../../auth/middleware/roles.middleware';
import { isCmsSection } from '../enums/cms.enum';
import { NothingToPublishError } from '../http-errors/nothing-to-publish.error';
import {
  createClient,
  editClient,
  getClientsDocument,
  getHomeDocument,
  publishSection,
  removeClient,
  saveHomeDraft,
} from '../services/cms.service';
import {
  cmsHomeSchema,
  createCmsClientSchema,
  updateCmsClientSchema,
} from '../validators/cms.validator';

export const cms = new Hono<AppBindings>();

// Editor surface (superadmin plan 04): GETs serve the DRAFT; the public site
// reads published-only via the /public/cms controller. Admin tier and up —
// owner passes via the role hierarchy in requireRole; technician (and the
// future office role) have no CMS access, reads included (plan 14 §2). The
// tenant `cms` module flag is likewise enforced here once tenant-config
// infra exists.
cms.use('*', requireRole('admin'));

const uuidSchema = z.string().uuid();

cms.get('/home', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  return c.json(await getHomeDocument(db, c.env.CDN_BASE_URL));
});

cms.put('/home', zValidator('json', cmsHomeSchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  return c.json(await saveHomeDraft(db, c.env.CDN_BASE_URL, c.req.valid('json')));
});

cms.get('/clients', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  return c.json(await getClientsDocument(db, c.env.CDN_BASE_URL));
});

cms.post('/clients', zValidator('json', createCmsClientSchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  return c.json(await createClient(db, c.env.CDN_BASE_URL, c.req.valid('json')), 201);
});

cms.patch('/clients/:id', zValidator('json', updateCmsClientSchema), async (c) => {
  const id = uuidSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'not_found' }, 404);
  const db = createDb(c.env.DATABASE_URL);
  const row = await editClient(db, c.env.CDN_BASE_URL, id.data, c.req.valid('json'));
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json(row);
});

cms.delete('/clients/:id', async (c) => {
  const id = uuidSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'not_found' }, 404);
  const db = createDb(c.env.DATABASE_URL);
  const row = await removeClient(db, id.data);
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json({ id: row.id, deleted: true });
});

cms.post('/:section/publish', async (c) => {
  const section = c.req.param('section');
  if (!isCmsSection(section)) return c.json({ error: 'not_found' }, 404);
  const db = createDb(c.env.DATABASE_URL);
  try {
    await publishSection(db, section);
  } catch (err) {
    if (err instanceof NothingToPublishError) {
      return c.json({ error: 'nothing_to_publish', message: err.message }, 409);
    }
    throw err;
  }
  return c.json({});
});

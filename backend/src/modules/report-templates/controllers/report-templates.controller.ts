import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { requireRole } from '../../auth/middleware/roles.middleware';
import {
  disableTemplateSchema,
  listTemplatesQuerySchema,
  saveTemplateSchema,
} from '../validators/report-templates.validator';
import {
  TemplateAlreadyDisabledError,
  TemplateNotActiveError,
  TemplateNotDraftError,
  activateTemplate,
  createTemplate,
  deactivateTemplate,
  disableTemplate,
  editTemplate,
  getTemplate,
  getTemplates,
} from '../services/report-templates.service';

export const reportTemplates = new Hono<AppBindings>();

// Reads are open to any authenticated user — the field app lists templates
// scoped `status=active` to start captures (06 §5.4). Mutations are gated
// admin-tier below. Responses are the bare template object / {items,total},
// matching the superadmin http contract.
reportTemplates.get('/', zValidator('query', listTemplatesQuerySchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  return c.json(await getTemplates(db, c.req.valid('query')));
});

reportTemplates.get('/:id', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const template = await getTemplate(db, c.req.param('id'));
  if (!template) return c.json({ error: 'not_found' }, 404);
  return c.json(template);
});

reportTemplates.use('*', requireRole(['owner', 'admin']));

reportTemplates.post('/', zValidator('json', saveTemplateSchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  return c.json(await createTemplate(db, c.req.valid('json')), 201);
});

reportTemplates.patch('/:id', zValidator('json', saveTemplateSchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  try {
    const template = await editTemplate(db, c.req.param('id'), c.req.valid('json'));
    if (!template) return c.json({ error: 'not_found' }, 404);
    return c.json(template);
  } catch (err) {
    if (err instanceof TemplateNotDraftError) return c.json({ error: 'template_not_draft' }, 409);
    throw err;
  }
});

reportTemplates.post('/:id/activate', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  try {
    const template = await activateTemplate(db, c.req.param('id'));
    if (!template) return c.json({ error: 'not_found' }, 404);
    return c.json(template);
  } catch (err) {
    if (err instanceof TemplateNotDraftError) return c.json({ error: 'template_not_draft' }, 409);
    throw err;
  }
});

reportTemplates.post('/:id/deactivate', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  try {
    const template = await deactivateTemplate(db, c.req.param('id'));
    if (!template) return c.json({ error: 'not_found' }, 404);
    return c.json(template);
  } catch (err) {
    if (err instanceof TemplateNotActiveError) {
      return c.json({ error: 'template_not_active' }, 409);
    }
    throw err;
  }
});

reportTemplates.post('/:id/disable', zValidator('json', disableTemplateSchema), async (c) => {
  const me = c.get('user');
  const db = createDb(c.env.DATABASE_URL);
  try {
    const template = await disableTemplate(
      db,
      c.req.param('id'),
      c.req.valid('json').reason,
      me.id,
    );
    if (!template) return c.json({ error: 'not_found' }, 404);
    return c.json(template);
  } catch (err) {
    if (err instanceof TemplateAlreadyDisabledError) {
      return c.json({ error: 'template_already_disabled' }, 409);
    }
    throw err;
  }
});

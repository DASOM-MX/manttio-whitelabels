import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { AppBindings } from '../../../env';
import { requireRole } from '../../auth/middleware/roles.middleware';
import { createDb } from '../../database/client';
import { fdGet, isFile } from '../../storage/utils/form-data';
import { replenishmentErrorResponse } from '../http-errors/replenishment-imports.error-response';
import {
  cancelImport,
  discardImport,
  editStagedRow,
  getImportAudit,
  getImportStatus,
  prepImport,
  processImport,
  rejectImport,
  removeStagedRow,
  resubmitImport,
  uploadImport,
} from '../services/replenishment-imports.service';
import {
  auditQuerySchema,
  cancelImportSchema,
  prepImportSchema,
  processImportSchema,
  rejectImportSchema,
  removeStagedRowSchema,
  updateStagedRowSchema,
} from '../validators/replenishment-imports.validator';

// Replenishment imports (10-wms/02 §6): upload → map → queue → review →
// decision. The queue consumer (11) and the approval that promotes staging
// into the inventory tables land in the following slices; nothing here writes
// stock.
export const replenishments = new Hono<AppBindings>();

const idSchema = z.string().uuid();
const lineSchema = z.coerce.number().int().min(1);

// Prep is owner/admin/office — office does the work and an admin signs it off
// (14 §2.1e, the draft-vs-commit split).
const prepRoles = requireRole(['owner', 'admin', 'office']);
// The approval DECISION, and row removal with it (owner 2026-07-20 — removal
// invites mismanagement).
const decisionRoles = requireRole(['owner', 'admin']);
// Full cancel closes the record outright, so it is the owner's alone.
const ownerOnly = requireRole(['owner']);

/** Multipart, because the sheet is the payload. Validated by hand rather than
 *  by `zValidator`: the body is a file plus one field, and the size/shape rules
 *  that matter live in the service where the R2 write is. */
replenishments.post('/imports', prepRoles, async (c) => {
  const form = await c.req.formData();
  const warehouseId = idSchema.safeParse(fdGet(form, 'warehouseId'));
  const file = fdGet(form, 'file');
  if (!warehouseId.success) return c.json({ error: 'invalid_parent' }, 400);
  if (!isFile(file)) {
    return c.json({ error: 'unparseable_file', message: 'Adjunta el archivo a importar.' }, 400);
  }

  const db = createDb(c.env.DATABASE_URL);
  try {
    const result = await uploadImport(db, c.env, c.get('user'), {
      warehouseId: warehouseId.data,
      fileName: file.name,
      bytes: await file.arrayBuffer(),
    });
    return c.json(result, 201);
  } catch (err) {
    return replenishmentErrorResponse(c, err);
  }
});

/** 202: the work has been accepted, not done. Status moves to `queued` and the
 *  client follows the row from there. */
replenishments.post(
  '/imports/:id/process',
  prepRoles,
  zValidator('json', processImportSchema),
  async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'not_found' }, 404);
    const db = createDb(c.env.DATABASE_URL);
    try {
      const result = await processImport(db, c.env, c.get('user'), id.data, c.req.valid('json'));
      return c.json(result, 202);
    } catch (err) {
      return replenishmentErrorResponse(c, err);
    }
  },
);

replenishments.get('/imports/:id', prepRoles, async (c) => {
  const id = idSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'not_found' }, 404);
  const db = createDb(c.env.DATABASE_URL);
  try {
    return c.json(await getImportStatus(db, c.get('user'), id.data));
  } catch (err) {
    return replenishmentErrorResponse(c, err);
  }
});

replenishments.get(
  '/imports/:id/audit',
  prepRoles,
  zValidator('query', auditQuerySchema),
  async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'not_found' }, 404);
    const db = createDb(c.env.DATABASE_URL);
    try {
      return c.json(await getImportAudit(db, c.get('user'), id.data, c.req.valid('query')));
    } catch (err) {
      return replenishmentErrorResponse(c, err);
    }
  },
);

replenishments.patch(
  '/imports/:id/rows/:line',
  prepRoles,
  zValidator('json', updateStagedRowSchema),
  async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    const line = lineSchema.safeParse(c.req.param('line'));
    if (!id.success || !line.success) return c.json({ error: 'not_found' }, 404);
    const db = createDb(c.env.DATABASE_URL);
    try {
      return c.json(
        await editStagedRow(db, c.get('user'), id.data, line.data, c.req.valid('json')),
      );
    } catch (err) {
      return replenishmentErrorResponse(c, err);
    }
  },
);

replenishments.delete(
  '/imports/:id/rows/:line',
  decisionRoles,
  zValidator('json', removeStagedRowSchema),
  async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    const line = lineSchema.safeParse(c.req.param('line'));
    if (!id.success || !line.success) return c.json({ error: 'not_found' }, 404);
    const db = createDb(c.env.DATABASE_URL);
    try {
      return c.json(
        await removeStagedRow(db, c.get('user'), id.data, line.data, c.req.valid('json')),
      );
    } catch (err) {
      return replenishmentErrorResponse(c, err);
    }
  },
);

replenishments.patch('/imports/:id', prepRoles, zValidator('json', prepImportSchema), async (c) => {
  const id = idSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'not_found' }, 404);
  const db = createDb(c.env.DATABASE_URL);
  try {
    return c.json(await prepImport(db, c.get('user'), id.data, c.req.valid('json')));
  } catch (err) {
    return replenishmentErrorResponse(c, err);
  }
});

replenishments.post(
  '/imports/:id/reject',
  decisionRoles,
  zValidator('json', rejectImportSchema),
  async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'not_found' }, 404);
    const db = createDb(c.env.DATABASE_URL);
    try {
      return c.json(await rejectImport(db, c.get('user'), id.data, c.req.valid('json')));
    } catch (err) {
      return replenishmentErrorResponse(c, err);
    }
  },
);

replenishments.post('/imports/:id/resubmit', prepRoles, async (c) => {
  const id = idSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'not_found' }, 404);
  const db = createDb(c.env.DATABASE_URL);
  try {
    return c.json(await resubmitImport(db, c.get('user'), id.data));
  } catch (err) {
    return replenishmentErrorResponse(c, err);
  }
});

replenishments.post('/imports/:id/discard', prepRoles, async (c) => {
  const id = idSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'not_found' }, 404);
  const db = createDb(c.env.DATABASE_URL);
  try {
    return c.json(await discardImport(db, c.get('user'), id.data));
  } catch (err) {
    return replenishmentErrorResponse(c, err);
  }
});

replenishments.post(
  '/imports/:id/cancel',
  ownerOnly,
  zValidator('json', cancelImportSchema),
  async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'not_found' }, 404);
    const db = createDb(c.env.DATABASE_URL);
    try {
      return c.json(await cancelImport(db, c.env, c.get('user'), id.data, c.req.valid('json')));
    } catch (err) {
      return replenishmentErrorResponse(c, err);
    }
  },
);

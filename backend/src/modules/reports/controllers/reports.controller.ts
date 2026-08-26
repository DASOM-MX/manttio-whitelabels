import { Hono } from 'hono';
import type { Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { requireRole } from '../../auth/middleware/roles.middleware';
import { fdGet, fdGetAll, isFile } from '../../storage/utils/form-data';
import { captureSchema } from '../validators/reports.validator';
import {
  assignReportSchema,
  createReportMetaSchema,
  listReportsQuerySchema,
  patchReportSchema,
  removePicturesSchema,
  signReportSchema,
} from '../validators/reports-routes.validator';
import { sendReportEmailSchema } from '../validators/report-email.validator';
import {
  addPictures,
  applyPatch,
  deletePictures,
  deleteReport,
  emailReport,
  ensureEditable,
  finishWithSignature,
  getReportForUser,
  listReportEmails,
  listReportsForUser,
  reassign,
  renderPdfForToken,
  renderPdfForUser,
  revokeReportEmail,
  submitReport,
} from '../services/reports.service';
import { UUID_PARAM } from '../../shared/constants/uuid-param';

export const reports = new Hono<AppBindings>();

/** waitUntil that degrades to a floating promise when the runtime provides no
 *  ExecutionContext (direct `app.request`, e.g. the Vitest pool) — every task
 *  scheduled through it is best-effort by design. */
const scheduleBackground =
  (c: Context<AppBindings>) =>
  (task: Promise<unknown>): void => {
    try {
      c.executionCtx.waitUntil(task);
    } catch {
      task.catch((err) => console.error('background task failed:', err));
    }
  };

// Token-bearer download (§9). JWT middleware skips `/reports/download/*`. The recipient's
// email contains a link to this route; we render the PDF on-demand and stream it back.
reports.get('/download/:token', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const rendered = await renderPdfForToken(db, c.env.LOGOS_CDN_BASE_URL, c.req.param('token'));
  if (!rendered) return c.json({ error: 'gone' }, 410);

  return new Response(rendered.pdf, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${rendered.id}.pdf"`,
      'cache-control': 'private, no-store',
    },
  });
});

// --- LIST + READ ---

reports.get('/', zValidator('query', listReportsQuerySchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const { status, body } = await listReportsForUser(db, c.get('user'), c.req.valid('query'));
  return c.json(body, status);
});

// In-app download: the same document the customer is mailed, rendered on demand.
// Registered before `/:id` for clarity; the patterns do not overlap.
reports.get(`/:id{${UUID_PARAM}}/pdf`, async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const result = await renderPdfForUser(db, c.env.LOGOS_CDN_BASE_URL, c.get('user'), c.req.param('id'));
  if (!result.pdf) return c.json(result.body, result.status as 403 | 404);

  return new Response(result.pdf, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${result.id}.pdf"`,
      'cache-control': 'private, no-store',
    },
  });
});

reports.get(`/:id{${UUID_PARAM}}`, async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const { status, body } = await getReportForUser(db, c.get('user'), c.req.param('id'));
  return c.json(body, status);
});

// --- CREATE (multipart) ---

reports.post('/', async (c) => {
  const me = c.get('user');
  const fd = await c.req.formData();

  const meta = createReportMetaSchema.parse({
    template_id: fdGet(fd, 'template_id') ?? undefined,
    work_type: fdGet(fd, 'work_type') ?? undefined,
    client_id: fdGet(fd, 'client_id') ?? undefined,
    date_arrival: fdGet(fd, 'date_arrival') ?? undefined,
    date_departure: fdGet(fd, 'date_departure') ?? undefined,
    comments: fdGet(fd, 'comments') ?? undefined,
    assigned_to: fdGet(fd, 'assigned_to') ?? undefined,
    created_by: fdGet(fd, 'created_by') ?? undefined,
    signed_by: fdGet(fd, 'signed_by') ?? undefined,
    signed_latitude: fdGet(fd, 'signed_latitude') ?? undefined,
    signed_longitude: fdGet(fd, 'signed_longitude') ?? undefined,
    signed_accuracy: fdGet(fd, 'signed_accuracy') ?? undefined,
  });

  const dataRaw = fdGet(fd, 'data');
  if (typeof dataRaw !== 'string') {
    return c.json({ error: 'missing_data' }, 400);
  }
  let dataParsed: unknown;
  try {
    dataParsed = JSON.parse(dataRaw);
  } catch {
    return c.json({ error: 'invalid_data_json' }, 400);
  }
  const data = captureSchema.parse(dataParsed);

  const db = createDb(c.env.DATABASE_URL);
  const { status, body } = await submitReport({
    db,
    env: c.env,
    waitUntil: scheduleBackground(c),
    user: me,
    meta,
    data,
    pictureFiles: fdGetAll(fd, 'pictures').filter(isFile),
    signatureFile: fdGet(fd, 'signature'),
    signatureBase64: fdGet(fd, 'signature_base64'),
  });
  return c.json(body, status);
});

// --- PATCH header + data (editable only) ---

reports.patch(`/:id{${UUID_PARAM}}`, zValidator('json', patchReportSchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const gate = await ensureEditable(db, c.get('user'), c.req.param('id'), 'not_editable');
  if (!gate.ok) return c.json(gate.result.body, gate.result.status);

  const { status, body } = await applyPatch(db, gate.report, c.req.valid('json'));
  return c.json(body, status);
});

// --- Reassign (admin only, any status) ---

reports.put(
  `/:id{${UUID_PARAM}}/assignee`,
  requireRole(['owner', 'admin']),
  zValidator('json', assignReportSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    const { assigned_to } = c.req.valid('json');
    const { status, body } = await reassign(db, c.req.param('id'), assigned_to);
    return c.json(body, status);
  },
);

// --- Sign + finish ---

reports.put(`/:id{${UUID_PARAM}}/signature`, async (c) => {
  const me = c.get('user');
  const db = createDb(c.env.DATABASE_URL);
  const gate = await ensureEditable(db, me, c.req.param('id'), 'already_signed');
  if (!gate.ok) return c.json(gate.result.body, gate.result.status);

  const fd = await c.req.formData();
  const signed = signReportSchema.parse({
    signed_by: fdGet(fd, 'signed_by') ?? '',
    signed_latitude: fdGet(fd, 'signed_latitude') ?? undefined,
    signed_longitude: fdGet(fd, 'signed_longitude') ?? undefined,
    signed_accuracy: fdGet(fd, 'signed_accuracy') ?? undefined,
  });

  const { status, body } = await finishWithSignature({
    db,
    env: c.env,
    waitUntil: scheduleBackground(c),
    user: me,
    report: gate.report,
    signed,
    signatureFile: fdGet(fd, 'signature'),
    signatureBase64: fdGet(fd, 'signature_base64'),
  });
  return c.json(body, status);
});

// --- Pictures: append + remove (editable only) ---

reports.put(`/:id{${UUID_PARAM}}/pictures`, async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const gate = await ensureEditable(db, c.get('user'), c.req.param('id'), 'not_editable');
  if (!gate.ok) return c.json(gate.result.body, gate.result.status);

  const fd = await c.req.formData();
  const files = fdGetAll(fd, 'pictures').filter(isFile);
  if (files.length === 0) return c.json({ error: 'no_files' }, 400);

  const { status, body } = await addPictures(db, c.env, gate.report.id, files);
  return c.json(body, status);
});

reports.delete(
  `/:id{${UUID_PARAM}}/pictures`,
  zValidator('json', removePicturesSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    const gate = await ensureEditable(db, c.get('user'), c.req.param('id'), 'not_editable');
    if (!gate.ok) return c.json(gate.result.body, gate.result.status);

    const { urls } = c.req.valid('json');
    const { status, body } = await deletePictures(db, c.env, gate.report.id, urls);
    return c.json(body, status);
  },
);

// --- Delete (admin, soft) ---

reports.delete(`/:id{${UUID_PARAM}}`, requireRole(['owner', 'admin']), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const { status, body } = await deleteReport(db, c.req.param('id'));
  return c.json(body, status);
});

// --- §9: email + history + revoke ---

reports.post(
  `/:id{${UUID_PARAM}}/email`,
  requireRole(['owner', 'admin']),
  zValidator('json', sendReportEmailSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    const { status, body } = await emailReport(
      db,
      c.env,
      c.get('user'),
      c.req.param('id'),
      c.req.valid('json'),
    );
    return c.json(body, status);
  },
);

reports.get(`/:id{${UUID_PARAM}}/emails`, requireRole(['owner', 'admin']), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const { status, body } = await listReportEmails(db, c.req.param('id'));
  return c.json(body, status);
});

reports.post(
  `/emails/:emailId{${UUID_PARAM}}/revoke`,
  requireRole(['owner', 'admin']),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    const { status, body } = await revokeReportEmail(db, c.req.param('emailId'));
    return c.json(body, status);
  },
);

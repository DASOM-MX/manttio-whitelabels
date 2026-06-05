import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings, AuthUser } from '../env';
import { createDb } from '../db/client';
import { reportDetails as reportDetailsTable, reports as reportsTable } from '../db/schema';
import {
  appendPictures,
  bumpToInProgress,
  createReport,
  findReportById,
  findReportWithDetails,
  listReports,
  markFinished,
  reassignReport,
  removePictures,
  softDeleteReport,
  type ReportFilters,
  type ReportRow,
} from '../db/repositories/reports';
import { findUserById } from '../db/repositories/users';
import { findCustomerById } from '../db/repositories/customers';
import { fdGet, fdGetAll, isFile } from '../lib/form-data';
import {
  cdnUrl,
  decodeBase64ToBytes,
  deleteObjects,
  keyFromCdnUrl,
  putObject,
  r2Key,
} from '../lib/r2';
import { dispatchReportEmail } from '../lib/dispatch-email';
import {
  findEmailByToken,
  listEmailsForReport,
  revokeEmail,
} from '../db/repositories/report-emails';
import { renderReportPdf } from '../lib/pdf';
import { sendReportEmailSchema } from '../validators/email';
import { isEditableStatus } from '../lib/report-lifecycle';
import { requireRole } from '../middleware/roles';
import { reportSchemas, validateReportData } from '../validators/reports';
import {
  assignReportSchema,
  createReportMetaSchema,
  listReportsQuerySchema,
  patchReportSchema,
  removePicturesSchema,
  signReportSchema,
} from '../validators/reports-routes';

export const reports = new Hono<AppBindings>();

// Token-bearer download (§9). JWT middleware skips `/reports/download/*`. The recipient's
// email contains a link to this route; we render the PDF on-demand and stream it back.
reports.get('/download/:token', async (c) => {
  const token = c.req.param('token');
  const db = createDb(c.env.DATABASE_URL);
  const found = await findEmailByToken(db, token);
  if (!found) return c.json({ error: 'gone' }, 410);

  const fullReport = await findReportWithDetails(db, found.email.reportId);
  if (!fullReport) return c.json({ error: 'gone' }, 410);

  const [creator, customer] = await Promise.all([
    findUserById(db, fullReport.report.createdBy),
    findCustomerById(db, fullReport.report.clientId),
  ]);
  if (!customer) return c.json({ error: 'gone' }, 410);

  const pdf = await renderReportPdf({
    report: {
      id: fullReport.report.id,
      reportType: fullReport.report.reportType,
      workType: fullReport.report.workType,
      dateArrival: fullReport.report.dateArrival,
      dateDeparture: fullReport.report.dateDeparture,
      finishedAt: fullReport.report.finishedAt,
      signedBy: fullReport.report.signedBy,
      signedLatitude: fullReport.report.signedLatitude,
      signedLongitude: fullReport.report.signedLongitude,
      signedAccuracy: fullReport.report.signedAccuracy,
    },
    data: (fullReport.details.data as Record<string, unknown>) ?? {},
    customer: {
      name: customer.name,
      identification: customer.identification,
      phone: customer.phone,
      email: customer.email,
      observation: customer.observation,
    },
    reportUserName: creator?.name ?? 'Técnico',
    pictureUrls: fullReport.details.pictures ?? [],
    signatureUrl: fullReport.details.signature,
  });

  return new Response(pdf, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${fullReport.report.id}.pdf"`,
      'cache-control': 'private, no-store',
    },
  });
});

// --- Helpers ---

const canAccess = (user: AuthUser, report: ReportRow) =>
  user.role === 'admin' || report.assignedTo === user.id;

const fileToBytes = (f: File) => f.arrayBuffer();

const uploadFileToR2 = async (
  bucket: R2Bucket,
  cdnBase: string,
  file: File,
): Promise<string> => {
  const key = r2Key(file.name || 'upload');
  const body = await fileToBytes(file);
  await putObject(bucket, key, body, file.type || 'application/octet-stream');
  return cdnUrl(cdnBase, key);
};

const uploadBase64SignatureToR2 = async (
  bucket: R2Bucket,
  cdnBase: string,
  base64: string,
): Promise<string> => {
  const bytes = decodeBase64ToBytes(base64);
  const key = r2Key('signature.png');
  await putObject(bucket, key, bytes.buffer as ArrayBuffer, 'image/png');
  return cdnUrl(cdnBase, key);
};

// --- LIST + READ ---

reports.get('/', zValidator('query', listReportsQuerySchema), async (c) => {
  const q = c.req.valid('query');
  const me = c.get('user');
  const db = createDb(c.env.DATABASE_URL);

  const filters: ReportFilters = {};
  if (q.status) filters.status = q.status as ReportFilters['status'];
  if (q.client_id) filters.clientId = q.client_id;
  if (q.work_type) filters.workType = q.work_type;
  if (q.state) filters.state = q.state;
  if (q.folio) filters.folio = q.folio;
  if (q.date_from) filters.dateFrom = new Date(q.date_from);
  if (q.date_to) filters.dateTo = new Date(q.date_to);

  if (me.role === 'admin') {
    if (q.assigned_to) filters.assignedTo = q.assigned_to;
  } else {
    // Technicians are auto-scoped to their own assigned reports — query param is ignored.
    filters.assignedTo = me.id;
  }

  const rows = await listReports(db, filters);
  return c.json({ reports: rows });
});

reports.get('/:id', async (c) => {
  const id = c.req.param('id');
  const me = c.get('user');
  const db = createDb(c.env.DATABASE_URL);

  const result = await findReportWithDetails(db, id);
  if (!result) return c.json({ error: 'not_found' }, 404);
  if (!canAccess(me, result.report)) return c.json({ error: 'forbidden' }, 403);
  return c.json(result);
});

// --- CREATE (multipart) ---

reports.post('/', async (c) => {
  const me = c.get('user');
  const fd = await c.req.formData();

  const meta = createReportMetaSchema.parse({
    report_type: fdGet(fd, 'report_type') ?? undefined,
    work_type: fdGet(fd, 'work_type') ?? undefined,
    client_id: fdGet(fd, 'client_id') ?? undefined,
    date_arrival: fdGet(fd, 'date_arrival') ?? undefined,
    date_departure: fdGet(fd, 'date_departure') ?? undefined,
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
  const data = validateReportData(meta.report_type, dataParsed);

  // Original creator: an offline report synced later carries the creator it was made
  // by (possibly a different user than the uploader); defaults to the uploader.
  const createdBy = meta.created_by ?? me.id;
  // Assignee defaults to the creator (so a synced offline report stays attributed to
  // the tech who did the work). Explicit `assigned_to` is honored — trusted-field model,
  // same as `created_by`; FK-validated below.
  const assignedTo = meta.assigned_to ?? createdBy;

  const db = createDb(c.env.DATABASE_URL);
  // Validate FK references early — surface a 400 rather than a 500 on FK violation.
  const [creator, assignee, client] = await Promise.all([
    findUserById(db, createdBy),
    findUserById(db, assignedTo),
    findCustomerById(db, meta.client_id),
  ]);
  if (!creator) return c.json({ error: 'invalid_creator' }, 400);
  if (!assignee) return c.json({ error: 'invalid_assignee' }, 400);
  if (!client) return c.json({ error: 'invalid_client' }, 400);

  // Upload files BEFORE opening the transaction. If the DB insert fails afterwards
  // we best-effort delete the orphaned R2 objects.
  const pictureFiles = fdGetAll(fd, 'pictures').filter(isFile);
  const signatureFile = fdGet(fd, 'signature');
  const signatureBase64 = fdGet(fd, 'signature_base64');

  const pictureUrls: string[] = [];
  let signatureUrl: string | null = null;

  try {
    for (const file of pictureFiles) {
      pictureUrls.push(
        await uploadFileToR2(c.env.MANTTIO_REPORTS, c.env.CDN_BASE_URL, file),
      );
    }
    if (isFile(signatureFile)) {
      signatureUrl = await uploadFileToR2(
        c.env.MANTTIO_REPORTS,
        c.env.CDN_BASE_URL,
        signatureFile,
      );
    } else if (typeof signatureBase64 === 'string' && signatureBase64.length > 0) {
      signatureUrl = await uploadBase64SignatureToR2(
        c.env.MANTTIO_REPORTS,
        c.env.CDN_BASE_URL,
        signatureBase64,
      );
    }
  } catch (err) {
    await cleanupR2(c.env.MANTTIO_REPORTS, c.env.CDN_BASE_URL, pictureUrls, signatureUrl);
    throw err;
  }

  try {
    const result = await createReport(
      db,
      {
        reportType: meta.report_type,
        workType: meta.work_type ?? null,
        dateArrival: meta.date_arrival ? new Date(meta.date_arrival) : null,
        dateDeparture: meta.date_departure ? new Date(meta.date_departure) : null,
        createdBy,
        assignedTo,
        clientId: meta.client_id,
        signedBy: meta.signed_by ?? null,
        state: client.state ?? null,
      },
      {
        data,
        pictures: pictureUrls,
        signature: signatureUrl,
        contentFilledAt:
          pictureUrls.length > 0 || signatureUrl ? new Date() : null,
      },
    );

    // If the report was signed at creation time, immediately transition to `finished`.
    // Geolocation is required when signing — reject early if it was not provided.
    if (signatureUrl && meta.signed_by) {
      if (meta.signed_latitude === undefined || meta.signed_longitude === undefined) {
        await cleanupR2(c.env.MANTTIO_REPORTS, c.env.CDN_BASE_URL, pictureUrls, signatureUrl);
        return c.json({ error: 'missing_signature_location' }, 400);
      }
      const finishResult = await markFinished(db, result.report.id, meta.signed_by, signatureUrl, {
        latitude: meta.signed_latitude,
        longitude: meta.signed_longitude,
        accuracy: meta.signed_accuracy ?? null,
      });
      if (finishResult) {
        // Auto-send to the customer's email if present. Best-effort, non-blocking —
        // failure here does not undo the signature; admin can re-send manually via
        // POST /:id/email. Mirrors the same waitUntil pattern as PUT /:id/signature.
        if (client.email) {
          c.executionCtx.waitUntil(
            dispatchReportEmail({
              db,
              env: c.env,
              reportId: finishResult.report.id,
              to: client.email,
              sentBy: me.id,
            }).then((r) => {
              if (!r.ok) console.error('auto-email failed:', r.error);
            }),
          );
        }
        return c.json(finishResult, 201);
      }
    }
    return c.json(result, 201);
  } catch (err) {
    await cleanupR2(c.env.MANTTIO_REPORTS, c.env.CDN_BASE_URL, pictureUrls, signatureUrl);
    throw err;
  }
});

const cleanupR2 = async (
  bucket: R2Bucket,
  cdnBase: string,
  pictureUrls: string[],
  signatureUrl: string | null,
) => {
  const keys: string[] = [];
  for (const url of pictureUrls) {
    const k = keyFromCdnUrl(cdnBase, url);
    if (k) keys.push(k);
  }
  if (signatureUrl) {
    const k = keyFromCdnUrl(cdnBase, signatureUrl);
    if (k) keys.push(k);
  }
  if (keys.length > 0) {
    try {
      await deleteObjects(bucket, keys);
    } catch {
      /* best effort */
    }
  }
};

// --- PATCH header + data (editable only) ---

reports.patch('/:id', zValidator('json', patchReportSchema), async (c) => {
  const id = c.req.param('id');
  const input = c.req.valid('json');
  const me = c.get('user');
  const db = createDb(c.env.DATABASE_URL);

  const current = await findReportById(db, id);
  if (!current) return c.json({ error: 'not_found' }, 404);
  if (!canAccess(me, current)) return c.json({ error: 'forbidden' }, 403);
  if (!isEditableStatus(current.status)) {
    return c.json({ error: 'not_editable', status: current.status }, 409);
  }

  if (input.client_id) {
    const client = await findCustomerById(db, input.client_id);
    if (!client) return c.json({ error: 'invalid_client' }, 400);
  }

  let validatedData: unknown | undefined;
  if (input.data !== undefined) {
    validatedData = validateReportData(current.reportType, input.data);
  }

  await db.transaction(async (tx) => {
    const now = new Date();
    if (
      input.work_type !== undefined ||
      input.date_arrival !== undefined ||
      input.date_departure !== undefined ||
      input.client_id !== undefined
    ) {
      await tx
        .update(reportsTable)
        .set({
          workType: input.work_type ?? current.workType,
          dateArrival: input.date_arrival ? new Date(input.date_arrival) : current.dateArrival,
          dateDeparture: input.date_departure
            ? new Date(input.date_departure)
            : current.dateDeparture,
          clientId: input.client_id ?? current.clientId,
          updatedAt: now,
        })
        .where(eq(reportsTable.id, id));
    }
    if (validatedData !== undefined) {
      await tx
        .update(reportDetailsTable)
        .set({
          data: validatedData,
          contentFilledAt: sql`coalesce(${reportDetailsTable.contentFilledAt}, now())`,
          updatedAt: now,
        })
        .where(eq(reportDetailsTable.reportId, id));
    }
    if (current.status === 'created') {
      await tx
        .update(reportsTable)
        .set({ status: 'in-progress', updatedAt: now })
        .where(eq(reportsTable.id, id));
    }
  });

  const result = await findReportWithDetails(db, id);
  return c.json(result);
});

// --- Reassign (admin only, any status) ---

reports.put('/:id/assignee', requireRole('admin'), zValidator('json', assignReportSchema), async (c) => {
  const id = c.req.param('id');
  const { assigned_to } = c.req.valid('json');
  const db = createDb(c.env.DATABASE_URL);

  const current = await findReportById(db, id);
  if (!current) return c.json({ error: 'not_found' }, 404);

  if (current.assignedTo === assigned_to) {
    return c.json({ report: current });
  }

  const target = await findUserById(db, assigned_to);
  if (!target) return c.json({ error: 'invalid_assignee' }, 400);

  const row = await reassignReport(db, id, assigned_to);
  return c.json({ report: row });
});

// --- Sign + finish (auto-email TODO §9) ---

reports.put('/:id/signature', async (c) => {
  const id = c.req.param('id');
  const me = c.get('user');
  const db = createDb(c.env.DATABASE_URL);

  const current = await findReportById(db, id);
  if (!current) return c.json({ error: 'not_found' }, 404);
  if (!canAccess(me, current)) return c.json({ error: 'forbidden' }, 403);
  if (!isEditableStatus(current.status)) {
    return c.json({ error: 'already_signed', status: current.status }, 409);
  }

  const fd = await c.req.formData();
  const signedByRaw = fdGet(fd, 'signed_by');
  const { signed_by, signed_latitude, signed_longitude, signed_accuracy } =
    signReportSchema.parse({
      signed_by: signedByRaw ?? '',
      signed_latitude: fdGet(fd, 'signed_latitude') ?? undefined,
      signed_longitude: fdGet(fd, 'signed_longitude') ?? undefined,
      signed_accuracy: fdGet(fd, 'signed_accuracy') ?? undefined,
    });

  const signatureFile = fdGet(fd, 'signature');
  const signatureBase64 = fdGet(fd, 'signature_base64');

  let signatureUrl: string;
  if (isFile(signatureFile)) {
    signatureUrl = await uploadFileToR2(
      c.env.MANTTIO_REPORTS,
      c.env.CDN_BASE_URL,
      signatureFile,
    );
  } else if (typeof signatureBase64 === 'string' && signatureBase64.length > 0) {
    signatureUrl = await uploadBase64SignatureToR2(
      c.env.MANTTIO_REPORTS,
      c.env.CDN_BASE_URL,
      signatureBase64,
    );
  } else {
    return c.json({ error: 'missing_signature' }, 400);
  }

  const result = await markFinished(db, id, signed_by, signatureUrl, {
    latitude: signed_latitude,
    longitude: signed_longitude,
    accuracy: signed_accuracy ?? null,
  });
  if (!result) {
    // The row vanished between the check and the update (race). Clean up the upload.
    const k = keyFromCdnUrl(c.env.CDN_BASE_URL, signatureUrl);
    if (k) await deleteObjects(c.env.MANTTIO_REPORTS, [k]);
    return c.json({ error: 'not_found' }, 404);
  }

  // Auto-send to the customer's email if present. Best-effort, non-blocking — failure
  // here does not undo the signature; admin can re-send manually via POST /:id/email.
  const customer = await findCustomerById(db, result.report.clientId);
  if (customer?.email) {
    c.executionCtx.waitUntil(
      dispatchReportEmail({
        db,
        env: c.env,
        reportId: result.report.id,
        to: customer.email,
        sentBy: me.id,
      }).then((r) => {
        if (!r.ok) console.error('auto-email failed:', r.error);
      }),
    );
  }
  return c.json(result);
});

// --- Pictures: append + remove (editable only) ---

reports.put('/:id/pictures', async (c) => {
  const id = c.req.param('id');
  const me = c.get('user');
  const db = createDb(c.env.DATABASE_URL);

  const current = await findReportById(db, id);
  if (!current) return c.json({ error: 'not_found' }, 404);
  if (!canAccess(me, current)) return c.json({ error: 'forbidden' }, 403);
  if (!isEditableStatus(current.status)) {
    return c.json({ error: 'not_editable', status: current.status }, 409);
  }

  const fd = await c.req.formData();
  const files = fdGetAll(fd, 'pictures').filter(isFile);
  if (files.length === 0) return c.json({ error: 'no_files' }, 400);

  const newUrls: string[] = [];
  try {
    for (const file of files) {
      newUrls.push(await uploadFileToR2(c.env.MANTTIO_REPORTS, c.env.CDN_BASE_URL, file));
    }
    const detailsRow = await appendPictures(db, id, newUrls);
    await bumpToInProgress(db, id);
    return c.json({ details: detailsRow });
  } catch (err) {
    await cleanupR2(c.env.MANTTIO_REPORTS, c.env.CDN_BASE_URL, newUrls, null);
    throw err;
  }
});

reports.delete('/:id/pictures', zValidator('json', removePicturesSchema), async (c) => {
  const id = c.req.param('id');
  const me = c.get('user');
  const { urls } = c.req.valid('json');
  const db = createDb(c.env.DATABASE_URL);

  const current = await findReportById(db, id);
  if (!current) return c.json({ error: 'not_found' }, 404);
  if (!canAccess(me, current)) return c.json({ error: 'forbidden' }, 403);
  if (!isEditableStatus(current.status)) {
    return c.json({ error: 'not_editable', status: current.status }, 409);
  }

  const detailsRow = await removePictures(db, id, urls);
  if (detailsRow) {
    const keys = urls
      .map((u) => keyFromCdnUrl(c.env.CDN_BASE_URL, u))
      .filter((k): k is string => k !== null);
    await deleteObjects(c.env.MANTTIO_REPORTS, keys);
  }
  return c.json({ details: detailsRow });
});

// --- Delete (admin, soft) ---

reports.delete('/:id', requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const db = createDb(c.env.DATABASE_URL);
  const row = await softDeleteReport(db, id);
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json({ id: row.id, deleted: true });
});

// --- §9: email + history + revoke ---

reports.post('/:id/email', requireRole('admin'), zValidator('json', sendReportEmailSchema), async (c) => {
  const id = c.req.param('id');
  const input = c.req.valid('json');
  const me = c.get('user');
  const db = createDb(c.env.DATABASE_URL);

  const report = await findReportById(db, id);
  if (!report) return c.json({ error: 'not_found' }, 404);
  if (report.status !== 'finished' && report.status !== 'mailed') {
    return c.json({ error: 'report_not_ready', status: report.status }, 409);
  }

  // Default `to` to the customer email if not specified.
  let to = input.to;
  if (!to) {
    const customer = await findCustomerById(db, report.clientId);
    if (!customer?.email) {
      return c.json({ error: 'no_recipient', message: 'customer has no email; provide `to` explicitly' }, 400);
    }
    to = customer.email;
  }

  const result = await dispatchReportEmail({
    db,
    env: c.env,
    reportId: id,
    to,
    cc: input.cc,
    sentBy: me.id,
    expiresInDays: input.expiresInDays,
  });
  if (!result.ok) {
    return c.json({ error: 'send_failed', detail: result.error }, 502);
  }
  return c.json({ emailId: result.email.id, sentAt: result.email.sentAt });
});

reports.get('/:id/emails', requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const db = createDb(c.env.DATABASE_URL);
  const report = await findReportById(db, id);
  if (!report) return c.json({ error: 'not_found' }, 404);
  const emails = await listEmailsForReport(db, id);
  return c.json({ emails });
});

reports.post('/emails/:emailId/revoke', requireRole('admin'), async (c) => {
  const emailId = c.req.param('emailId');
  const db = createDb(c.env.DATABASE_URL);
  const row = await revokeEmail(db, emailId);
  if (!row) return c.json({ error: 'not_found_or_already_revoked' }, 404);
  return c.json({ id: row.id, revoked: true });
});


import { eq, sql } from 'drizzle-orm';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Db } from '../../database/client';
import type { AuthUser, Env } from '../../../env';
import { reportDetails, reports } from '../models/reports.model';
import { findCustomerById } from '../../customers/repository/customers.repository';
import { emitServicePerformed } from '../../customers/repository/interactions.repository';
import { findUserById } from '../../users/repository/users.repository';
import {
  appendPictures,
  bumpToInProgress,
  createReport,
  findReportById,
  findReportWithDetails,
  listReports,
  listReportsForCustomer,
  markFinished,
  reassignReport,
  removePictures,
  softDeleteReport,
} from '../repository/reports.repository';
import {
  findEmailByToken,
  listEmailsForReport,
  revokeEmail,
} from '../repository/report-emails.repository';
import {
  cdnUrl,
  decodeBase64ToBytes,
  deleteObjects,
  keyFromCdnUrl,
  putObject,
  r2Key,
} from '../../storage/services/storage.service';
import { isFile, type FormValue } from '../../storage/utils/form-data';
import { canAccess } from '../utils/report-access';
import { isAdminTier } from '../../auth/utils/role-tier';
import { isBirthStatus, isEditableStatus } from '../utils/report-lifecycle';
import { ReportStatus } from '../enums/reports.enum';
import { captureSchema } from '../validators/reports.validator';
import { renderReportPdf } from '../helpers/report-pdf.helpers';
import { getBrand } from '../../brand/services/brand.service';
import { notifyBestEffort } from '../../notifications/services/notifications.service';
import { NotificationType } from '../../notifications/enums/notifications.enum';
import { dispatchReportEmail } from './report-email.service';
import type { CustomerReportDTO, ReportRow } from '../types/reports.types';
import type {
  CreateReportMeta,
  ListReportsQuery,
  PatchReportInput,
  SignReportInput,
} from '../validators/reports-routes.validator';
import type { SendReportEmailInput } from '../validators/report-email.validator';

// Uniform JSON result the controller relays verbatim via `c.json(body, status)`.
export type JsonResult = { status: ContentfulStatusCode; body: unknown };
type BackgroundScheduler = (task: Promise<unknown>) => void;

/** Compact report list for the customer 360 "Servicios" tab + equipment
 *  retro-link picker (GET /customers/:id/reports). */
export const getCustomerReports = async (
  db: Db,
  customerId: string,
): Promise<CustomerReportDTO[]> => listReportsForCustomer(db, customerId);

// The trail body a finished report writes (08 §2). Work type when present reads
// naturally ("Servicio realizado — Preventivo"), else the generic line.
const servicePerformedBody = (report: ReportRow): string =>
  report.workType ? `Servicio realizado — ${report.workType}` : 'Servicio realizado';

/** Emit the "service performed" system trail entry when a report reaches
 *  `finished` (08 §2). Best-effort: a trail-insert failure must never fail the
 *  report submission, which is already committed. */
const recordServicePerformed = async (db: Db, report: ReportRow): Promise<void> => {
  try {
    await emitServicePerformed(db, {
      customerId: report.clientId,
      reportId: report.id,
      userId: report.assignedTo,
      body: servicePerformedBody(report),
    });
  } catch (err) {
    console.error('service-performed trail entry failed:', err);
  }
};

/** Owner awareness feed for the report lifecycle (notifications plan §1 note):
 *  owner broadcast, the acting user excluded, deep link via data.reportId. */
const notifyReportEvent = (
  db: Db,
  type: NotificationType.ReportCreated | NotificationType.ReportFinalized,
  report: ReportRow,
  customerName: string | null,
  actorId: string,
): Promise<void> =>
  notifyBestEffort(db, {
    role: 'owner',
    excludeUserId: actorId,
    type,
    title: type === NotificationType.ReportCreated ? 'Reporte creado' : 'Reporte finalizado',
    body:
      type === NotificationType.ReportCreated
        ? `Reporte ${report.id}${customerName ? ` para ${customerName}` : ''}.`
        : `Reporte ${report.id}${customerName ? ` de ${customerName}` : ''} fue finalizado.`,
    data: { reportId: report.id, customerId: report.clientId },
  });

// --- R2 helpers (moved verbatim from the old route module) ---

const uploadFileToR2 = async (
  bucket: R2Bucket,
  cdnBase: string,
  file: File,
): Promise<string> => {
  const key = r2Key(file.name || 'upload');
  const body = await file.arrayBuffer();
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

// --- editable-report gate shared by patch / signature / pictures ---

type EditableGate =
  | { ok: true; report: ReportRow }
  | { ok: false; result: JsonResult };

export const ensureEditable = async (
  db: Db,
  user: AuthUser,
  id: string,
  notEditableCode: string,
): Promise<EditableGate> => {
  const current = await findReportById(db, id);
  if (!current) return { ok: false, result: { status: 404, body: { error: 'not_found' } } };
  if (!canAccess(user, current)) {
    return { ok: false, result: { status: 403, body: { error: 'forbidden' } } };
  }
  if (!isEditableStatus(current.status)) {
    return {
      ok: false,
      result: { status: 409, body: { error: notEditableCode, status: current.status } },
    };
  }
  return { ok: true, report: current };
};

// --- LIST + READ ---

export const listReportsForUser = async (
  db: Db,
  user: AuthUser,
  q: ListReportsQuery,
): Promise<JsonResult> => {
  const filters: Parameters<typeof listReports>[1] = {};
  if (q.status) filters.status = q.status as (typeof filters)['status'];
  if (q.client_id) filters.clientId = q.client_id;
  if (q.template_id) filters.templateId = q.template_id;
  if (q.work_type) filters.workType = q.work_type;
  if (q.state) filters.state = q.state;
  if (q.folio) filters.folio = q.folio;
  if (q.date_from) filters.dateFrom = new Date(q.date_from);
  if (q.date_to) filters.dateTo = new Date(q.date_to);

  if (isAdminTier(user)) {
    if (q.assigned_to) filters.assignedTo = q.assigned_to;
  } else {
    // Technicians are auto-scoped to their own assigned reports — query param is ignored.
    filters.assignedTo = user.id;
  }

  const rows = await listReports(db, filters);
  return { status: 200, body: { reports: rows } };
};

export const getReportForUser = async (
  db: Db,
  user: AuthUser,
  id: string,
): Promise<JsonResult> => {
  const result = await findReportWithDetails(db, id);
  if (!result) return { status: 404, body: { error: 'not_found' } };
  if (!canAccess(user, result.report)) return { status: 403, body: { error: 'forbidden' } };
  return { status: 200, body: result };
};

// --- CREATE (multipart) ---

export type SubmitReportParams = {
  db: Db;
  env: Env;
  waitUntil: BackgroundScheduler;
  user: AuthUser;
  meta: CreateReportMeta;
  data: unknown;
  pictureFiles: File[];
  signatureFile: FormValue;
  signatureBase64: FormValue;
};

export const submitReport = async (p: SubmitReportParams): Promise<JsonResult> => {
  const { db, env, waitUntil, user, meta, data } = p;

  // Original creator: an offline report synced later carries the creator it was made
  // by (possibly a different user than the uploader); defaults to the uploader.
  const createdBy = meta.created_by ?? user.id;
  // Assignee defaults to the creator (so a synced offline report stays attributed to
  // the tech who did the work). Explicit `assigned_to` is honored — trusted-field model.
  const assignedTo = meta.assigned_to ?? createdBy;

  // Validate FK references early — surface a 400 rather than a 500 on FK violation.
  const [creator, assignee, client] = await Promise.all([
    findUserById(db, createdBy),
    findUserById(db, assignedTo),
    findCustomerById(db, meta.client_id),
  ]);
  if (!creator) return { status: 400, body: { error: 'invalid_creator' } };
  if (!assignee) return { status: 400, body: { error: 'invalid_assignee' } };
  if (!client) return { status: 400, body: { error: 'invalid_client' } };

  // Upload files BEFORE opening the transaction. If the DB insert fails afterwards
  // we best-effort delete the orphaned R2 objects.
  const pictureUrls: string[] = [];
  let signatureUrl: string | null = null;

  try {
    for (const file of p.pictureFiles) {
      pictureUrls.push(await uploadFileToR2(env.MANTTIO_REPORTS, env.CDN_BASE_URL, file));
    }
    if (isFile(p.signatureFile)) {
      signatureUrl = await uploadFileToR2(env.MANTTIO_REPORTS, env.CDN_BASE_URL, p.signatureFile);
    } else if (typeof p.signatureBase64 === 'string' && p.signatureBase64.length > 0) {
      signatureUrl = await uploadBase64SignatureToR2(
        env.MANTTIO_REPORTS,
        env.CDN_BASE_URL,
        p.signatureBase64,
      );
    }
  } catch (err) {
    await cleanupR2(env.MANTTIO_REPORTS, env.CDN_BASE_URL, pictureUrls, signatureUrl);
    throw err;
  }

  try {
    // Validate the capture data against the structural schema
    const validatedCapture = captureSchema.parse(data);

    const result = await createReport(
      db,
      {
        templateId: validatedCapture.templateId,
        reportType: validatedCapture.templateName,
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
        data: validatedCapture,
        pictures: pictureUrls,
        signature: signatureUrl,
        contentFilledAt: pictureUrls.length > 0 || signatureUrl ? new Date() : null,
      },
    );

    // If the report was signed at creation time, immediately transition to `finished`.
    // Geolocation is required when signing — reject early if it was not provided.
    if (signatureUrl && meta.signed_by) {
      if (meta.signed_latitude === undefined || meta.signed_longitude === undefined) {
        await cleanupR2(env.MANTTIO_REPORTS, env.CDN_BASE_URL, pictureUrls, signatureUrl);
        return { status: 400, body: { error: 'missing_signature_location' } };
      }
      const finishResult = await markFinished(db, result.report.id, meta.signed_by, signatureUrl, {
        latitude: meta.signed_latitude,
        longitude: meta.signed_longitude,
        accuracy: meta.signed_accuracy ?? null,
      });
      if (finishResult) {
        // Trail entry: the report just reached `finished` (08 §2).
        await recordServicePerformed(db, finishResult.report);
        // Signed-at-creation goes straight to `finished` — one notice, not two.
        await notifyReportEvent(
          db,
          NotificationType.ReportFinalized,
          finishResult.report,
          client.name,
          user.id,
        );
        // Auto-send to the customer's email if present. Best-effort, non-blocking.
        if (client.email) {
          waitUntil(
            dispatchReportEmail({
              db,
              env,
              reportId: finishResult.report.id,
              to: client.email,
              sentBy: user.id,
            }).then((r) => {
              if (!r.ok) console.error('auto-email failed:', r.error);
            }),
          );
        }
        return { status: 201, body: finishResult };
      }
    }
    await notifyReportEvent(db, NotificationType.ReportCreated, result.report, client.name, user.id);
    return { status: 201, body: result };
  } catch (err) {
    await cleanupR2(env.MANTTIO_REPORTS, env.CDN_BASE_URL, pictureUrls, signatureUrl);
    throw err;
  }
};

// --- PATCH header + data (editable only) ---

export const applyPatch = async (
  db: Db,
  report: ReportRow,
  input: PatchReportInput,
): Promise<JsonResult> => {
  if (input.client_id) {
    const client = await findCustomerById(db, input.client_id);
    if (!client) return { status: 400, body: { error: 'invalid_client' } };
  }

  let validatedData: unknown | undefined;
  if (input.data !== undefined) {
    validatedData = captureSchema.parse(input.data);
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
        .update(reports)
        .set({
          workType: input.work_type ?? report.workType,
          dateArrival: input.date_arrival ? new Date(input.date_arrival) : report.dateArrival,
          dateDeparture: input.date_departure
            ? new Date(input.date_departure)
            : report.dateDeparture,
          clientId: input.client_id ?? report.clientId,
          updatedAt: now,
        })
        .where(eq(reports.id, report.id));
    }
    if (validatedData !== undefined) {
      await tx
        .update(reportDetails)
        .set({
          data: validatedData,
          contentFilledAt: sql`coalesce(${reportDetails.contentFilledAt}, now())`,
          updatedAt: now,
        })
        .where(eq(reportDetails.reportId, report.id));
    }
    // Either birth state promotes on the first content write — `pending`
    // (exploded from an order) skips `created` entirely (19 §2).
    if (isBirthStatus(report.status)) {
      await tx
        .update(reports)
        .set({ status: ReportStatus.InProgress, updatedAt: now })
        .where(eq(reports.id, report.id));
    }
  });

  const result = await findReportWithDetails(db, report.id);
  return { status: 200, body: result };
};

// --- Reassign (admin only, any status) ---

export const reassign = async (
  db: Db,
  id: string,
  assignedTo: string,
): Promise<JsonResult> => {
  const current = await findReportById(db, id);
  if (!current) return { status: 404, body: { error: 'not_found' } };
  if (current.assignedTo === assignedTo) return { status: 200, body: { report: current } };

  const target = await findUserById(db, assignedTo);
  if (!target) return { status: 400, body: { error: 'invalid_assignee' } };

  const row = await reassignReport(db, id, assignedTo);
  return { status: 200, body: { report: row } };
};

// --- Sign + finish ---

export type FinishWithSignatureParams = {
  db: Db;
  env: Env;
  waitUntil: BackgroundScheduler;
  user: AuthUser;
  report: ReportRow;
  signed: SignReportInput;
  signatureFile: FormValue;
  signatureBase64: FormValue;
};

export const finishWithSignature = async (
  p: FinishWithSignatureParams,
): Promise<JsonResult> => {
  const { db, env, waitUntil, user, report } = p;

  let signatureUrl: string;
  if (isFile(p.signatureFile)) {
    signatureUrl = await uploadFileToR2(env.MANTTIO_REPORTS, env.CDN_BASE_URL, p.signatureFile);
  } else if (typeof p.signatureBase64 === 'string' && p.signatureBase64.length > 0) {
    signatureUrl = await uploadBase64SignatureToR2(
      env.MANTTIO_REPORTS,
      env.CDN_BASE_URL,
      p.signatureBase64,
    );
  } else {
    return { status: 400, body: { error: 'missing_signature' } };
  }

  const result = await markFinished(db, report.id, p.signed.signed_by, signatureUrl, {
    latitude: p.signed.signed_latitude,
    longitude: p.signed.signed_longitude,
    accuracy: p.signed.signed_accuracy ?? null,
  });
  if (!result) {
    // The row vanished between the check and the update (race). Clean up the upload.
    const k = keyFromCdnUrl(env.CDN_BASE_URL, signatureUrl);
    if (k) await deleteObjects(env.MANTTIO_REPORTS, [k]);
    return { status: 404, body: { error: 'not_found' } };
  }

  // Trail entry: the report just reached `finished` (08 §2).
  await recordServicePerformed(db, result.report);

  // Auto-send to the customer's email if present. Best-effort, non-blocking.
  const customer = await findCustomerById(db, result.report.clientId);
  await notifyReportEvent(
    db,
    NotificationType.ReportFinalized,
    result.report,
    customer?.name ?? null,
    user.id,
  );
  if (customer?.email) {
    waitUntil(
      dispatchReportEmail({
        db,
        env,
        reportId: result.report.id,
        to: customer.email,
        sentBy: user.id,
      }).then((r) => {
        if (!r.ok) console.error('auto-email failed:', r.error);
      }),
    );
  }
  return { status: 200, body: result };
};

// --- Pictures: append + remove (editable only) ---

export const addPictures = async (
  db: Db,
  env: Env,
  id: string,
  files: File[],
): Promise<JsonResult> => {
  const newUrls: string[] = [];
  try {
    for (const file of files) {
      newUrls.push(await uploadFileToR2(env.MANTTIO_REPORTS, env.CDN_BASE_URL, file));
    }
    const detailsRow = await appendPictures(db, id, newUrls);
    await bumpToInProgress(db, id);
    return { status: 200, body: { details: detailsRow } };
  } catch (err) {
    await cleanupR2(env.MANTTIO_REPORTS, env.CDN_BASE_URL, newUrls, null);
    throw err;
  }
};

export const deletePictures = async (
  db: Db,
  env: Env,
  id: string,
  urls: string[],
): Promise<JsonResult> => {
  const detailsRow = await removePictures(db, id, urls);
  if (detailsRow) {
    const keys = urls
      .map((u) => keyFromCdnUrl(env.CDN_BASE_URL, u))
      .filter((k): k is string => k !== null);
    await deleteObjects(env.MANTTIO_REPORTS, keys);
  }
  return { status: 200, body: { details: detailsRow } };
};

// --- Delete (admin, soft) ---

export const deleteReport = async (db: Db, id: string): Promise<JsonResult> => {
  const row = await softDeleteReport(db, id);
  if (!row) return { status: 404, body: { error: 'not_found' } };
  return { status: 200, body: { id: row.id, deleted: true } };
};

// --- §9: email + history + revoke ---

export const emailReport = async (
  db: Db,
  env: Env,
  user: AuthUser,
  id: string,
  input: SendReportEmailInput,
): Promise<JsonResult> => {
  const report = await findReportById(db, id);
  if (!report) return { status: 404, body: { error: 'not_found' } };
  if (report.status !== ReportStatus.Finished && report.status !== ReportStatus.Mailed) {
    return { status: 409, body: { error: 'report_not_ready', status: report.status } };
  }

  // Default `to` to the customer email if not specified.
  let to = input.to;
  if (!to) {
    const customer = await findCustomerById(db, report.clientId);
    if (!customer?.email) {
      return {
        status: 400,
        body: { error: 'no_recipient', message: 'customer has no email; provide `to` explicitly' },
      };
    }
    to = customer.email;
  }

  const result = await dispatchReportEmail({
    db,
    env,
    reportId: id,
    to,
    cc: input.cc,
    sentBy: user.id,
    expiresInDays: input.expiresInDays,
  });
  if (!result.ok) {
    return { status: 502, body: { error: 'send_failed', detail: result.error } };
  }
  return { status: 200, body: { emailId: result.email.id, sentAt: result.email.sentAt } };
};

export const listReportEmails = async (db: Db, id: string): Promise<JsonResult> => {
  const report = await findReportById(db, id);
  if (!report) return { status: 404, body: { error: 'not_found' } };
  const emails = await listEmailsForReport(db, id);
  return { status: 200, body: { emails } };
};

export const revokeReportEmail = async (db: Db, emailId: string): Promise<JsonResult> => {
  const row = await revokeEmail(db, emailId);
  if (!row) return { status: 404, body: { error: 'not_found_or_already_revoked' } };
  return { status: 200, body: { id: row.id, revoked: true } };
};

// --- Token-bearer PDF download (§9) ---

export const renderPdfForToken = async (
  db: Db,
  logosCdnBase: string,
  token: string,
): Promise<{ id: string; pdf: Uint8Array } | null> => {
  const found = await findEmailByToken(db, token);
  if (!found) return null;

  const fullReport = await findReportWithDetails(db, found.email.reportId);
  if (!fullReport) return null;

  const [creator, customer, brand] = await Promise.all([
    findUserById(db, fullReport.report.createdBy),
    findCustomerById(db, fullReport.report.clientId),
    getBrand(db, logosCdnBase),
  ]);
  if (!customer) return null;

  const pdf = await renderReportPdf({
    brand,
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
      timezone: customer.timezone,
    },
    reportUserName: creator?.name ?? 'Técnico',
    pictureUrls: fullReport.details.pictures ?? [],
    signatureUrl: fullReport.details.signature,
  });

  return { id: fullReport.report.id, pdf };
};

import type { Db } from '../../database/client';
import type { Env } from '../../../env';
import { findCustomerById } from '../../customers/repository/customers.repository';
import { findUserById } from '../../users/repository/users.repository';
import { findReportWithDetails, markMailed } from '../repository/reports.repository';
import {
  insertReportEmail,
  setResendMessageId,
} from '../repository/report-emails.repository';
import type { ReportEmailRow } from '../types/reports.types';
import { generateAccessToken } from '../utils/access-token';
import {
  renderReportEmailHTML,
  renderReportEmailSubject,
  renderReportEmailText,
  type ReportEmailParams,
} from '../templates/report-email.template';
import { sendEmail } from '../../email/services/email.service';

export type DispatchEmailParams = {
  db: Db;
  env: Env;
  reportId: string;
  to: string;
  cc?: string[];
  sentBy: string;
  expiresInDays?: number;
};

export type DispatchResult =
  | { ok: true; email: ReportEmailRow }
  | { ok: false; error: string };

const daysFromNow = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d;
};

export const dispatchReportEmail = async (
  p: DispatchEmailParams,
): Promise<DispatchResult> => {
  const result = await findReportWithDetails(p.db, p.reportId);
  if (!result) return { ok: false, error: 'report_not_found' };

  const [creator, signer, customer] = await Promise.all([
    findUserById(p.db, result.report.createdBy),
    result.report.assignedTo === result.report.createdBy
      ? Promise.resolve(null)
      : findUserById(p.db, result.report.assignedTo),
    findCustomerById(p.db, result.report.clientId),
  ]);
  if (!customer) return { ok: false, error: 'customer_not_found' };
  const createdByName = creator?.name ?? 'Técnico';
  const signedByName = result.report.signedBy ?? signer?.name ?? null;

  const accessToken = generateAccessToken();
  const expiresAt = p.expiresInDays ? daysFromNow(p.expiresInDays) : null;

  const emailRow = await insertReportEmail(p.db, {
    reportId: p.reportId,
    sentBy: p.sentBy,
    recipientTo: p.to,
    recipientCc: p.cc ?? [],
    accessToken,
    expiresAt,
  });

  const downloadUrl = `${p.env.API_BASE_URL}/reports/download/${accessToken}`;
  const tplParams: ReportEmailParams = {
    folio: result.report.id,
    customerName: customer.name,
    recipientEmail: p.to,
    reportType: result.report.reportType,
    workType: result.report.workType,
    dateArrival: result.report.dateArrival,
    finishedAt: result.report.finishedAt,
    createdByName,
    signedByName,
    signedLatitude: result.report.signedLatitude,
    signedLongitude: result.report.signedLongitude,
    signedAccuracy: result.report.signedAccuracy,
    downloadUrl,
    timezone: customer.timezone,
    brand: {
      name: p.env.BRAND_NAME,
      siteUrl: p.env.BRAND_SITE_URL,
      logoUrl: p.env.BRAND_LOGO_URL,
    },
  };

  try {
    const { id: resendId } = await sendEmail({
      apiKey: p.env.RESEND_API_KEY,
      from: p.env.RESEND_FROM,
      to: p.to,
      cc: p.cc,
      subject: renderReportEmailSubject(result.report.id),
      html: renderReportEmailHTML(tplParams),
      text: renderReportEmailText(tplParams),
    });
    await setResendMessageId(p.db, emailRow.id, resendId);
    await markMailed(p.db, p.reportId);
    return { ok: true, email: { ...emailRow, resendMessageId: resendId } };
  } catch (err) {
    // The report_emails row is already inserted; we keep it as evidence of the attempt
    // but leave `resend_message_id` null so admins can see the send failed.
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
};

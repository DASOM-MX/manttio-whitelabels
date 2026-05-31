import type { ReportRow, ReportDetailRow, ReportData } from './dtos/report';
import type { ReportStatus } from './types/report';
import type { PendingReport } from '../../offline/pending-report.model';
import type { ReportViewModel } from './report-detail.model';

/** Statuses that count as "done" (read-only, finished workflow). */
const DONE_STATUSES: ReportStatus[] = ['finished', 'mailed'];

/** Maps a server report (+ details) into the view model. */
export const toViewModel = (report: ReportRow, details: ReportDetailRow | null): ReportViewModel => {
  const data = (details?.data ?? {}) as Partial<ReportData>;
  const lat = report.signedLatitude;
  const lng = report.signedLongitude;
  return {
    id: report.id,
    report_type: report.reportType,
    manttio_type: report.workType ?? '',
    report_status: DONE_STATUSES.includes(report.status),
    date_arrival: report.dateArrival,
    date_departure: report.dateDeparture,
    signature: details?.signature ?? null,
    signed_by: report.signedBy,
    signed_latitude: lat,
    signed_longitude: lng,
    signed_accuracy: report.signedAccuracy,
    signed_maps_url:
      lat !== null && lng !== null
        ? `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`
        : null,
    pictures: details?.pictures ?? [],
    observations: (data as { observations?: string }).observations ?? '',
    ...data,
  };
};

/** Builds the same view model from a report queued offline. Picture/signature blobs
 *  are passed in as already-created object URLs (or a base64 data URL for the
 *  signature) so the read-only template renders identically to a server report. */
export const toViewModelFromPending = (
  rec: PendingReport,
  pictureUrls: string[],
  signatureUrl: string | null,
): ReportViewModel => {
  const data = rec.fields.data as Partial<ReportData>;
  return {
    id: rec.tempId,
    report_type: rec.fields.report_type,
    manttio_type: rec.fields.work_type ?? '',
    report_status: false,
    date_arrival: rec.fields.date_arrival ?? null,
    date_departure: null,
    signature: signatureUrl,
    signed_by: null,
    signed_latitude: rec.fields.signed_latitude ?? null,
    signed_longitude: rec.fields.signed_longitude ?? null,
    signed_accuracy: rec.fields.signed_accuracy ?? null,
    signed_maps_url: null,
    pictures: pictureUrls,
    observations: (data as { observations?: string }).observations ?? '',
    ...data,
  };
};

import type { ReportDetail, ReportCapture } from './dtos/report';
import { ReportStatus } from './types/report';
import type { PendingReport } from '../../offline/pending-report.model';
import type { ReportViewModel } from './report-detail.model';

/** Statuses that count as "done" (read-only, finished workflow). */
const DONE_STATUSES: ReportStatus[] = [ReportStatus.Finished, ReportStatus.Mailed];

/** Maps a server report detail into the view model. Renders from the stored snapshot. */
export const toViewModel = (detail: ReportDetail): ReportViewModel => {
  const lat = detail.signedLatitude;
  const lng = detail.signedLongitude;
  return {
    id: detail.id,
    template_id: detail.templateId,
    report_type: detail.reportType,
    manttio_type: detail.workType ?? '',
    report_status: DONE_STATUSES.includes(detail.status),
    date_arrival: detail.dateArrival,
    date_departure: detail.dateDeparture,
    signature: detail.signatureUrl ?? null,
    signed_by: detail.signedBy,
    signed_latitude: lat,
    signed_longitude: lng,
    signed_accuracy: detail.signedAccuracy,
    signed_maps_url:
      lat !== null && lng !== null
        ? `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`
        : null,
    pictures: detail.photos ?? [],
    comments: detail.comments ?? '',
    sections: detail.sections,
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
  const capture = rec.fields.data as ReportCapture;
  return {
    id: rec.tempId,
    template_id: capture?.templateId ?? null,
    report_type: capture?.templateName ?? '',
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
    comments: rec.fields.comments ?? '',
    sections: capture?.sections ?? [],
  };
};

import type { CreateReportFields } from '../app/data/dtos/report';
import type { ReportType } from '../app/data/types/report';

/** Upload lifecycle of a report captured while offline. */
export enum PendingReportStatus {
  Pending = 'pending',
  Uploading = 'uploading',
  Failed = 'failed',
}

/** Snapshot of the user who created the report, taken at capture time so
 *  attribution survives a phone being handed to another technician/admin. */
export interface PendingReportCreator {
  id: string;
  name: string;
  email: string;
}

/** A finished report created with no connection, awaiting upload. Persisted in
 *  IndexedDB — `fields` carries the picture/signature `File`/`Blob`s verbatim
 *  (structured-clone storable), and `fields.date_arrival` keeps the real field
 *  timestamp even when the report is uploaded much later. */
export interface PendingReport {
  /** Client-generated id (`crypto.randomUUID()`). Primary key. */
  tempId: string;
  fields: CreateReportFields;
  createdBy: PendingReportCreator;
  /** When the report was queued offline (ISO). */
  createdAt: string;
  status: PendingReportStatus;
  lastError?: string;
}

/** Lightweight projection of a {@link PendingReport} for list/badge UIs — carries
 *  no blobs, so it's cheap to hold in NGXS state and render. */
export interface PendingReportSummary {
  tempId: string;
  reportType: ReportType;
  clientId: string;
  createdBy: PendingReportCreator;
  createdAt: string;
  status: PendingReportStatus;
  lastError?: string;
}

export const toPendingSummary = (r: PendingReport): PendingReportSummary => ({
  tempId: r.tempId,
  reportType: r.fields.report_type,
  clientId: r.fields.client_id,
  createdBy: r.createdBy,
  createdAt: r.createdAt,
  status: r.status,
  lastError: r.lastError,
});

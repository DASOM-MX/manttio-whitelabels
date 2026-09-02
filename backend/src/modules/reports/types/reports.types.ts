import type { reportDetails, reports } from '../models/reports.model';
import type { reportEmails } from '../models/report-emails.model';
import type { reportEvents } from '../models/report-events.model';
import type { ReportStatus, WorkType } from '../enums/reports.enum';
import type { ReportEventType } from '../enums/reports.enum';
import type { CapturedSection } from '../validators/reports.validator';

export type ReportRow = typeof reports.$inferSelect;
export type ReportDetailRow = typeof reportDetails.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
export type NewReportDetail = typeof reportDetails.$inferInsert;

export type ReportEmailRow = typeof reportEmails.$inferSelect;
export type NewReportEmail = typeof reportEmails.$inferInsert;

export type ReportEventRow = typeof reportEvents.$inferSelect;
export type NewReportEvent = typeof reportEvents.$inferInsert;

/** One row of the paged report list. Carries the joined customer/technician names
 *  the browsers render, plus `templateName` (= the frozen `report_type`). Not the
 *  raw `reports` row — see `listReports`. */
export type ReportSummaryRow = {
  id: string;
  templateId: string | null;
  templateName: string;
  reportType: string;
  workType: WorkType | null;
  status: ReportStatus;
  state: string | null;
  clientId: string;
  customerName: string | null;
  assignedTo: string;
  technicianName: string | null;
  serviceOrderId: string | null;
  serviceId: string | null;
  dateArrival: Date | null;
  finishedAt: Date | null;
  mailedAt: Date | null;
  createdAt: Date;
};

export type ReportFilters = {
  status?: ReportStatus;
  clientId?: string;
  assignedTo?: string;
  templateId?: string;
  workType?: WorkType;
  state?: string;
  // Folio (report id) prefix match. e.g. `R-20260503` returns all of that day.
  folio?: string;
  // Free-text search across folio, customer name and technician name — what the
  // superadmin list's single search box sends. Distinct from `folio`, which is an
  // exact prefix match on the id alone.
  search?: string;
  // Date range filters apply to `date_arrival`. Either bound is optional.
  dateFrom?: Date;
  dateTo?: Date;
};

export type SignedLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
};

/** Compact client-scoped report row for the customer 360 "Servicios" tab and
 *  the equipment retro-link picker (served by GET /customers/:id/reports).
 *  `folio` === the report id (folio-style). `technicianName` is joined. */
export interface CustomerReportDTO {
  id: string;
  folio: string;
  serviceDate: string;
  reportType: string;
  workType: string | null;
  technicianName: string | null;
  status: ReportStatus;
}

/** Flat report detail with sections from the snapshot (CP-2). */
export interface ReportDetail {
  id: string;
  templateId: string | null;
  templateName: string;
  reportType: string;
  workType: WorkType | null;
  dateArrival: Date | null;
  dateDeparture: Date | null;
  createdBy: string;
  assignedTo: string;
  clientId: string;
  serviceOrderId: string | null;
  serviceId: string | null;
  signedBy: string | null;
  status: ReportStatus;
  state: string | null;
  signedAt: Date | null;
  signedLatitude: number | null;
  signedLongitude: number | null;
  signedAccuracy: number | null;
  finishedAt: Date | null;
  mailedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  sections: CapturedSection[];
  photos: string[];
  signatureUrl: string | null;
  comments?: string | null;
}

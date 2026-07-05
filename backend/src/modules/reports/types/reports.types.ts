import type { reportDetails, reports } from '../models/reports.model';
import type { reportEmails } from '../models/report-emails.model';
import type { ReportStatus, WorkType } from '../enums/reports.enum';

export type ReportRow = typeof reports.$inferSelect;
export type ReportDetailRow = typeof reportDetails.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
export type NewReportDetail = typeof reportDetails.$inferInsert;

export type ReportEmailRow = typeof reportEmails.$inferSelect;
export type NewReportEmail = typeof reportEmails.$inferInsert;

export type ReportFilters = {
  status?: ReportStatus;
  clientId?: string;
  assignedTo?: string;
  workType?: WorkType;
  state?: string;
  // Folio (report id) prefix match. e.g. `R-20260503` returns all of that day.
  folio?: string;
  // Date range filters apply to `date_arrival`. Either bound is optional.
  dateFrom?: Date;
  dateTo?: Date;
};

export type SignedLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
};

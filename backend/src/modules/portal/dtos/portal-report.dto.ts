import type { ReportDetailRow, ReportRow } from '../../reports/types/reports.types';
import type { ReportStatus } from '../../reports/enums/reports.enum';

/** The joins a portal report response needs; both mappers take the same set. */
export interface PortalReportExtras {
  technicianName: string | null;
  equipmentNames: string[];
}

/** A report row as the customer sees it (04 §3). `id` is the folio. Staff
 *  attribution beyond the named technician (A13) is dropped. */
export interface PortalReportListItem {
  id: string;
  reportType: string;
  dateArrival: Date | null;
  dateDeparture: Date | null;
  /** A13 — the technician is always named; the PDF already names them. */
  technicianName: string | null;
  /** The units this report covered, for the list's equipment/site column. */
  equipmentNames: string[];
  status: ReportStatus;
  createdAt: Date;
}

/** The finished report as the customer received it. `comments` and `signedBy`
 *  are kept because the emailed PDF already carries both. */
export interface PortalReportDetail extends PortalReportListItem {
  comments: string | null;
  signedBy: string | null;
  signedAt: Date | null;
  /** The answered template snapshot. */
  data: unknown;
  pictures: string[];
  signature: string | null;
}

export const toPortalReportListItem = (
  row: ReportRow,
  extras: PortalReportExtras,
): PortalReportListItem => ({
  id: row.id,
  reportType: row.reportType,
  dateArrival: row.dateArrival,
  dateDeparture: row.dateDeparture,
  technicianName: extras.technicianName,
  equipmentNames: extras.equipmentNames,
  status: row.status,
  createdAt: row.createdAt,
});

export const toPortalReportDetail = (
  row: ReportRow,
  details: ReportDetailRow | null,
  extras: PortalReportExtras,
): PortalReportDetail => ({
  id: row.id,
  reportType: row.reportType,
  dateArrival: row.dateArrival,
  dateDeparture: row.dateDeparture,
  technicianName: extras.technicianName,
  equipmentNames: extras.equipmentNames,
  status: row.status,
  createdAt: row.createdAt,
  comments: row.comments,
  signedBy: row.signedBy,
  signedAt: row.signedAt,
  data: details?.data ?? null,
  pictures: details?.pictures ?? [],
  signature: details?.signature ?? null,
});

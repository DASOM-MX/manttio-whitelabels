import type { ReportStatus } from '../../reports/enums/reports.enum';

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

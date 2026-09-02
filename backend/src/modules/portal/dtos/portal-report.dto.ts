import type { ReportStatus } from '../../reports/enums/reports.enum';

/** A report row as the customer sees it (04 §3). `id` is the folio. Staff
 *  attribution beyond the named technician (A13) is dropped. */
export interface PortalReportListItem {
  id: string;
  reportType: string;
  dateArrival: string | null;
  dateDeparture: string | null;
  /** A13 — the technician is always named; the PDF already names them. */
  technicianName: string | null;
  /** The units this report covered, for the list's equipment/site column. */
  equipmentNames: string[];
  status: ReportStatus;
  createdAt: string;
}

/** The finished report as the customer received it. `comments` and `signedBy`
 *  are kept because the emailed PDF already carries both. */
export interface PortalReportDetail extends PortalReportListItem {
  comments: string | null;
  signedBy: string | null;
  signedAt: string | null;
  /** The answered template snapshot. */
  data: unknown;
  pictures: string[];
  signature: string | null;
}

/** A report as it appears hanging off another record — the service order's
 *  linked list (04 §6) and the equipment unit's history (04 §7). Picked from the
 *  list item rather than restated, so the two can never describe the same report
 *  differently. */
export type PortalLinkedReport = Pick<
  PortalReportListItem,
  'id' | 'reportType' | 'status' | 'createdAt'
>;

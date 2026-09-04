import type { ReportStatus } from '../../../model/enums/report/report-status.enum';

/** A report row as the customer sees it (backend `PortalReportListItem`,
 *  04 §3). `id` is the folio. */
export interface PortalReportListItem {
  id: string;
  reportType: string;
  dateArrival: string | null;
  dateDeparture: string | null;
  /** A13 — the technician is always named. */
  technicianName: string | null;
  /** The units this report covered, for the list's equipment/site column. */
  equipmentNames: string[];
  status: ReportStatus;
  createdAt: string;
}

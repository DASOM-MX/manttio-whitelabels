import type { PortalReportListItem } from './portal-report-list-item.dto';
import type { PortalReportCapture } from './portal-report-capture.dto';

/** The finished report as the customer received it (backend
 *  `PortalReportDetail`, 04 §3). */
export interface PortalReportDetail extends PortalReportListItem {
  comments: string | null;
  signedBy: string | null;
  signedAt: string | null;
  data: PortalReportCapture | null;
  pictures: string[];
  signature: string | null;
}

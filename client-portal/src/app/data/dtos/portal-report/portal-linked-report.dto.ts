import type { PortalReportListItem } from './portal-report-list-item.dto';

/** A report as it appears hanging off another record — the service order's
 *  linked list (04 §6) and (later) the equipment unit's history. Mirrors the
 *  backend `PortalLinkedReport`, itself a `Pick` off `PortalReportListItem` so
 *  the two can never describe the same report differently. */
export type PortalLinkedReport = Pick<
  PortalReportListItem,
  'id' | 'reportType' | 'status' | 'createdAt'
>;

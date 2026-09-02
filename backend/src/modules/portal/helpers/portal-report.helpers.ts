import type { ReportDetailRow, ReportRow } from '../../reports/types/reports.types';
import type { PortalReportDetail, PortalReportListItem } from '../dtos/portal-report.dto';
import type { PortalReportExtras } from '../types/portal.types';

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
  ...toPortalReportListItem(row, extras),
  comments: row.comments,
  signedBy: row.signedBy,
  signedAt: row.signedAt,
  data: details?.data ?? null,
  pictures: details?.pictures ?? [],
  signature: details?.signature ?? null,
});

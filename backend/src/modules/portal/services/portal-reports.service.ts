import type { Db } from '../../database/client';
import { appendReportEvents } from '../../reports/repository/report-events.repository';
import { renderStoredReport } from '../../reports/services/reports.service';
import type { GenericQueryResponse } from '../../shared/types/generic-query-response.types';
import type { PortalReportDetail, PortalReportListItem } from '../dtos/portal-report.dto';
import {
  toPortalReportDetail,
  toPortalReportListItem,
} from '../helpers/portal-report.helpers';
import {
  equipmentNamesForReports,
  findPortalReport,
  findPortalReportContent,
  listPortalReports,
} from '../repository/portal-reports.repository';
import { portalReportDownloadEvent } from '../utils/portal-download-events';
import { recordedDownload } from '../utils/portal-download';
import { mapPage } from '../utils/portal-page';
import type { PortalReportsQuery } from '../validators/portal-reads.validator';
import type {
  PortalDownloadUser,
  PortalReportDownload,
} from '../types/portal-downloads.types';

export const listReportsForPortal = async (
  db: Db,
  customerId: string,
  q: PortalReportsQuery,
): Promise<GenericQueryResponse<PortalReportListItem>> => {
  const page = await listPortalReports(db, customerId, q);
  const names = await equipmentNamesForReports(
    db,
    page.items.map((i) => i.row.id),
  );
  return mapPage(page, (i) =>
    toPortalReportListItem(i.row, {
      technicianName: i.technicianName,
      equipmentNames: names.get(i.row.id) ?? [],
    }),
  );
};

export const getReportForPortal = async (
  db: Db,
  customerId: string,
  id: string,
): Promise<PortalReportDetail | null> => {
  const found = await findPortalReport(db, customerId, id);
  if (!found) return null;
  const [content, names] = await Promise.all([
    findPortalReportContent(db, found.row.id),
    equipmentNamesForReports(db, [found.row.id]),
  ]);
  return toPortalReportDetail(found.row, content, {
    technicianName: found.technicianName,
    equipmentNames: names.get(found.row.id) ?? [],
  });
};

/** The report PDF (04 §3) — the same renderer staff use. `recordedDownload`
 *  owns 04 §2b: the `report_events` row commits before a byte is rendered, and
 *  every fetch writes one — no first-download-only dedup. */
export const downloadReportForPortal = async (
  db: Db,
  logosCdnBase: string,
  portalUser: PortalDownloadUser,
  id: string,
): Promise<PortalReportDownload | null> =>
  recordedDownload(
    db,
    (tx) => findPortalReport(tx, portalUser.customerId, id),
    (tx, found) =>
      appendReportEvents(tx, [portalReportDownloadEvent(found.row.id, portalUser.id)]),
    (found) => renderStoredReport(db, logosCdnBase, found.row.id),
  );

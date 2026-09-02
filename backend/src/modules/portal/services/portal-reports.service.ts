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
import type { PortalReportsQuery } from '../validators/portal-reads.validator';

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
  return {
    ...page,
    items: page.items.map((i) =>
      toPortalReportListItem(i.row, {
        technicianName: i.technicianName,
        equipmentNames: names.get(i.row.id) ?? [],
      }),
    ),
  };
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

/** The report PDF (04 §3) — the same renderer staff use.
 *
 *  The scope check and the download event share one transaction (04 §2b): the
 *  row is committed before a single byte is rendered, so a download that cannot
 *  be recorded is never served. Every fetch writes a row — no
 *  first-download-only dedup. */
export const downloadReportForPortal = async (
  db: Db,
  logosCdnBase: string,
  portalUser: { id: string; customerId: string },
  id: string,
): Promise<{ id: string; pdf: Uint8Array } | null> => {
  const allowed = await db.transaction(async (tx) => {
    const found = await findPortalReport(tx, portalUser.customerId, id);
    if (!found) return false;
    await appendReportEvents(tx, [portalReportDownloadEvent(found.row.id, portalUser.id)]);
    return true;
  });
  if (!allowed) return null;

  return renderStoredReport(db, logosCdnBase, id);
};

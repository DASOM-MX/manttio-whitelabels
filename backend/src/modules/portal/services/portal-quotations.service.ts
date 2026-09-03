import type { Db } from '../../database/client';
import type { Env } from '../../../env';
import { getBrand } from '../../brand/services/brand.service';
import { findCustomerById } from '../../customers/repository/customers.repository';
import { renderQuotationPDF } from '../../quotations/helpers/quotation-pdf.helpers';
import {
  appendEvents,
  listLinesForQuotations,
  listRecipientsForQuotations,
} from '../../quotations/repository/quotations.repository';
import type {
  QuotationLineDTO,
  QuotationLineRow,
} from '../../quotations/types/quotations.types';
import { lineSubtotal, quotationTotals } from '../../quotations/utils/quotation-totals';
import type { GenericQueryResponse } from '../../shared/types/generic-query-response.types';
import type {
  PortalQuotationDetail,
  PortalQuotationListItem,
  PortalQuotationReviewer,
} from '../dtos/portal-quotation.dto';
import {
  toPortalQuotationDetail,
  toPortalQuotationLine,
  toPortalQuotationListItem,
  toPortalQuotationReviewer,
} from '../helpers/portal-quotation.helpers';
import {
  findPortalQuotation,
  listPortalQuotations,
} from '../repository/portal-quotations.repository';
import { portalQuotationDownloadEvent } from '../utils/portal-download-events';
import { recordedDownload } from '../utils/portal-download';
import { mapPage } from '../utils/portal-page';
import type { PortalQuotationsQuery } from '../validators/portal-reads.validator';

/** Overdue is computed per read against one calendar day (owner 2026-07-26) —
 *  taken here so no mapper reads a clock. */
const today = () => new Date().toISOString().slice(0, 10);

const totalOf = (lines: QuotationLineRow[]): string => quotationTotals(lines).total;

/** Reviewers only (A14). Informational recipients are filtered out rather than
 *  blanked — they hold no decision, and listing them would turn the panel into
 *  a distribution log. */
const reviewersFor = async (
  db: Db,
  quotationId: string,
): Promise<PortalQuotationReviewer[]> => {
  const rows = await listRecipientsForQuotations(db, [quotationId]);
  return rows
    .filter((r) => r.recipient.isReviewer)
    .map((r) => toPortalQuotationReviewer(r.recipient, r.contactName));
};

export const listQuotationsForPortal = async (
  db: Db,
  customerId: string,
  q: PortalQuotationsQuery,
): Promise<GenericQueryResponse<PortalQuotationListItem>> => {
  const page = await listPortalQuotations(db, customerId, q);
  const lines = await listLinesForQuotations(
    db,
    page.items.map((row) => row.id),
  );
  const byQuotation = new Map<string, QuotationLineRow[]>();
  for (const line of lines) {
    const bucket = byQuotation.get(line.quotationId);
    if (bucket) bucket.push(line);
    else byQuotation.set(line.quotationId, [line]);
  }

  const day = today();
  return mapPage(page, (row) =>
    toPortalQuotationListItem(row, { total: totalOf(byQuotation.get(row.id) ?? []) }, day),
  );
};

export const getQuotationForPortal = async (
  db: Db,
  customerId: string,
  id: string,
): Promise<PortalQuotationDetail | null> => {
  const row = await findPortalQuotation(db, customerId, id);
  if (!row) return null;

  const [lines, reviewers] = await Promise.all([
    listLinesForQuotations(db, [row.id]),
    reviewersFor(db, row.id),
  ]);

  return toPortalQuotationDetail(
    row,
    { total: totalOf(lines), lines: lines.map(toPortalQuotationLine), reviewers },
    today(),
  );
};

/** The PDF layout's line shape — the same one the send and the token page use,
 *  so all three documents render identically. */
const toPdfLine = (row: QuotationLineRow): QuotationLineDTO => ({
  id: row.id,
  serviceId: row.serviceId ?? undefined,
  serviceName: row.serviceName,
  description: row.description ?? undefined,
  unitPrice: row.unitPrice,
  uom: row.uom,
  taxRate: row.taxRate,
  quantity: row.quantity,
  discountAmount: row.discountAmount,
  lineSubtotal: lineSubtotal(row),
});

/** The quotation PDF (04 §5) — the same document the send attaches.
 *
 *  `recordedDownload` owns 04 §2b. The portal side of `quotation_events` is
 *  `contactId`, not `portalUserId`: that table also serves the emailed token
 *  page, which has a contact and no login (01 §6c). */
export const downloadQuotationForPortal = async (
  db: Db,
  env: Env,
  portalUser: { contactId: string; customerId: string },
  id: string,
): Promise<{ filename: string; bytes: Uint8Array } | null> =>
  recordedDownload(
    db,
    (tx) => findPortalQuotation(tx, portalUser.customerId, id),
    (tx, row) => appendEvents(tx, [portalQuotationDownloadEvent(row.id, portalUser.contactId)]),
    async (quotation) => {
      const [lines, customer, brand] = await Promise.all([
        listLinesForQuotations(db, [quotation.id]),
        findCustomerById(db, quotation.customerId),
        getBrand(db, env.LOGOS_CDN_BASE_URL),
      ]);

      return {
        filename: `${quotation.folio}.pdf`,
        bytes: await renderQuotationPDF({
          brand,
          folio: quotation.folio,
          customerName: customer?.name ?? '',
          validUntil: quotation.validUntil,
          comments: quotation.comments ?? undefined,
          lines: lines.map(toPdfLine),
          totals: quotationTotals(lines),
        }),
      };
    },
  );

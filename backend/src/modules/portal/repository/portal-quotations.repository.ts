import { and, desc, eq, ilike, type SQL } from 'drizzle-orm';
import type { Db, DbOrTx } from '../../database/client';
import { quotations } from '../../quotations/models/quotations.model';
import type { QuotationRow } from '../../quotations/types/quotations.types';
import type { GenericQueryResponse } from '../../shared/types/generic-query-response.types';
import { PORTAL_QUOTATION_STATUSES } from '../constants/portal-visibility';
import { portalPage, portalRow, portalScope } from './portal-reads.repository';
import type { PortalQuotationsQuery } from '../validators/portal-reads.validator';

// Scope + release: the token's customer, live rows, and only the statuses the
// customer was actually mailed. `draft` and `cancelled` are absent from every
// list and 404 on direct access (04 §2).
const visible = (customerId: string): SQL =>
  portalScope({ customer: quotations.customerId, deletedAt: quotations.deletedAt }, customerId, {
    column: quotations.status,
    statuses: PORTAL_QUOTATION_STATUSES,
  });

const filters = (customerId: string, q: PortalQuotationsQuery): SQL => {
  const conds: SQL[] = [visible(customerId)];
  // ANDed on top of the released set, so asking for `draft` returns nothing
  // rather than widening the read.
  if (q.status) conds.push(eq(quotations.status, q.status));
  if (q.search) conds.push(ilike(quotations.folio, `%${q.search}%`));
  return and(...conds)!;
};

export const listPortalQuotations = async (
  db: Db,
  customerId: string,
  q: PortalQuotationsQuery,
): Promise<GenericQueryResponse<QuotationRow>> => {
  const where = filters(customerId, q);
  return portalPage(
    db,
    quotations,
    where,
    q,
    db.select().from(quotations).where(where).orderBy(desc(quotations.createdAt)).$dynamic(),
    (row) => row,
  );
};

/** One quotation, scope- and release-checked. `DbOrTx` so the PDF route can run
 *  it inside the transaction that appends the download event. */
export const findPortalQuotation = async (
  runner: DbOrTx,
  customerId: string,
  id: string,
): Promise<QuotationRow | null> =>
  portalRow(
    runner
      .select()
      .from(quotations)
      .where(and(eq(quotations.id, id), visible(customerId)))
      .$dynamic(),
    (row) => row,
  );

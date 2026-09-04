import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import type { Db, DbOrTx } from '../../database/client';
import { contracts } from '../../contracts/models/contracts.model';
import { ContractValidity } from '../../contracts/enums/contracts.enum';
import type { ContractRow } from '../../contracts/types/contracts.types';
import type { GenericQueryResponse } from '../../shared/types/generic-query-response.types';
import { portalPage, portalRow, portalScope } from './portal-reads.repository';
import type { PortalContractsQuery } from '../validators/portal-reads.validator';

// Scope + release. Live rows only — a soft delete is also how a contract is
// terminated early (13 §1), so one predicate covers both of 04 §2's exclusions.
// `visible_to_roles` is deliberately NOT applied: it restricts which *staff*
// roles may open a document, and says nothing about the customer whose contract
// it is.
const visible = (customerId: string): SQL =>
  portalScope({ customer: contracts.customerId, deletedAt: contracts.deletedAt }, customerId);

// Validity is derived from the dates, never stored (13 §1) — the SQL half of
// `validityOf`, which the DTO mapper runs on the way out.
const validityFilter = (validity: ContractValidity): SQL => {
  switch (validity) {
    case ContractValidity.NotStarted:
      return sql`${contracts.validFromDate} > current_date`;
    case ContractValidity.Expired:
      return sql`${contracts.expiryDate} is not null and ${contracts.expiryDate} < current_date`;
    case ContractValidity.Active:
      return sql`${contracts.validFromDate} <= current_date
        and (${contracts.expiryDate} is null or ${contracts.expiryDate} >= current_date)`;
  }
};

const filters = (customerId: string, q: PortalContractsQuery): SQL => {
  const conds: SQL[] = [visible(customerId)];
  if (q.type) conds.push(eq(contracts.type, q.type));
  if (q.validity) conds.push(validityFilter(q.validity));
  if (q.dateFrom) conds.push(sql`${contracts.validFromDate} >= ${q.dateFrom}::date`);
  if (q.dateTo) conds.push(sql`${contracts.validFromDate} <= ${q.dateTo}::date`);
  if (q.search) {
    const term = `%${q.search}%`;
    // Folio and title only: the internal description is not a portal field, so
    // it must not be searchable from here either.
    const match = or(ilike(contracts.folio, term), ilike(contracts.name, term));
    if (match) conds.push(match);
  }
  return and(...conds)!;
};

export const listPortalContracts = async (
  db: Db,
  customerId: string,
  q: PortalContractsQuery,
): Promise<GenericQueryResponse<ContractRow>> => {
  const where = filters(customerId, q);
  return portalPage(
    db,
    contracts,
    where,
    q,
    db.select().from(contracts).where(where).orderBy(desc(contracts.createdAt)).$dynamic(),
    (row) => row,
  );
};

/** One contract, scope-checked. `DbOrTx` so the download route can run it inside
 *  the transaction that appends the download event. The row carries `fileKey`;
 *  the DTO mapper is what keeps it off the wire. */
export const findPortalContract = async (
  runner: DbOrTx,
  customerId: string,
  id: string,
): Promise<ContractRow | null> =>
  portalRow(
    runner
      .select()
      .from(contracts)
      .where(and(eq(contracts.id, id), visible(customerId)))
      .$dynamic(),
    (row) => row,
  );

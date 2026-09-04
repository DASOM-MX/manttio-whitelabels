import { and, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type { PgSelect, PgTable } from 'drizzle-orm/pg-core';
import type { Db } from '../../database/client';
import type { GenericQueryResponse } from '../../shared/types/generic-query-response.types';
import type {
  PortalPageQuery,
  PortalReleasedStatuses,
  PortalRowMapper,
  PortalScopeColumns,
} from '../types/portal-reads.types';

// The shape every portal read shares. Sections differ in tables, columns and
// filters; they must not differ in how a row is scoped, counted or enveloped.

/** Scope + release, the predicate every portal read starts from (02 §4, 04 §2):
 *  the caller's customer, live rows, and the released statuses where a section
 *  has them. Deriving every `visible()` from here is what stops a new read
 *  shipping without the customer scope or the soft-delete filter. */
export const portalScope = (
  cols: PortalScopeColumns,
  customerId: string,
  released?: PortalReleasedStatuses,
): SQL => {
  const conds: SQL[] = [eq(cols.customer, customerId), isNull(cols.deletedAt)];
  if (released) conds.push(inArray(released.column, released.statuses));
  return and(...conds)!;
};

/** The list half of a section: page window, unpaginated count, envelope. `qb` is
 *  a `$dynamic()` select the caller has already shaped; `table`/`where` come
 *  again because the count is a second query that must not inherit the window —
 *  `total` is what the filter matched, never `items.length`. */
export const portalPage = async <TSel extends PgSelect, TItem>(
  db: Db,
  table: PgTable,
  where: SQL,
  q: PortalPageQuery,
  qb: TSel,
  map: PortalRowMapper<TSel, TItem>,
): Promise<GenericQueryResponse<TItem>> => {
  const [rows, counted] = await Promise.all([
    qb.limit(q.limit).offset((q.page - 1) * q.limit),
    db.select({ total: sql<number>`count(*)::int` }).from(table).where(where),
  ]);
  return {
    items: rows.map(map),
    total: counted[0]?.total ?? 0,
    page: q.page,
    limit: q.limit,
  };
};

/** The detail half: the first row or null. Scope lives in the caller's `where`,
 *  so another customer's row is simply not found — the 404 comes from the
 *  absence, never from a check after the fetch. */
export const portalRow = async <TSel extends PgSelect, TItem>(
  qb: TSel,
  map: PortalRowMapper<TSel, TItem>,
): Promise<TItem | null> => {
  const [row] = await qb.limit(1);
  return row ? map(row) : null;
};

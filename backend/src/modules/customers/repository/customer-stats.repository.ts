import { and, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { customers } from '../models/customers.model';
import { CustomerStatus } from '../enums/customers.enum';
import type { IntakePeriod, IntakeSourceCounts } from '../types/customer-stats.types';

// "When the current status took effect": rows still holding their birth status
// carry NULL status_changed_at, so readers coalesce to created_at (utm-params 03).
const effectiveAt = sql`coalesce(${customers.statusChangedAt}, ${customers.createdAt})`;

const inWindow = (period: IntakePeriod) =>
  sql`${effectiveAt} >= ${period.from.toISOString()} and ${effectiveAt} < ${period.to.toISOString()}`;

// count(*) is Postgres's fast path (count(1) adds a per-row null-check on the
// constant); FILTER splits one scan into the four buckets.
const bucket = (status: CustomerStatus, period: IntakePeriod) =>
  sql<number>`(count(*) filter (where ${customers.status} = ${status} and ${inWindow(period)}))::int`;

/** Lead/active counts per source for both periods in ONE round trip / ONE
 *  scan (perf revision 2026-07-21 — replaces the query-per-period version):
 *  the windows are contiguous (`previous.to === period.from`), so a single
 *  overall range bounds the scan and FILTER aggregates split the buckets.
 *  Soft-deleted rows excluded; `customers_intake_effective_idx` carries the
 *  range predicate. */
export const countIntakeBySource = async (
  db: Db,
  period: IntakePeriod,
  previous: IntakePeriod,
): Promise<IntakeSourceCounts[]> => {
  return db
    .select({
      source: customers.source,
      leads: bucket(CustomerStatus.Lead, period),
      active: bucket(CustomerStatus.Active, period),
      prevLeads: bucket(CustomerStatus.Lead, previous),
      prevActive: bucket(CustomerStatus.Active, previous),
    })
    .from(customers)
    .where(
      and(
        isNull(customers.deletedAt),
        inArray(customers.status, [CustomerStatus.Lead, CustomerStatus.Active]),
        inWindow({ from: previous.from, to: period.to }),
      ),
    )
    .groupBy(customers.source);
};

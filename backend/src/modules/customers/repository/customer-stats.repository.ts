import { and, asc, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { customers } from '../models/customers.model';
import { CustomerSource, CustomerStatus } from '../enums/customers.enum';
import type {
  FollowUpRow,
  IntakePeriod,
  IntakeSourceCounts,
  TrendPoint,
} from '../types/customer-stats.types';

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

// Bucket key in UTC — the intake windows are UTC month boundaries, so the
// trend must truncate in the same zone or edge rows drift a month.
const monthKey = sql<string>`to_char(${effectiveAt} at time zone 'utc', 'YYYY-MM')`;

/** Monthly lead/active buckets over [from, to) for the dashboard trend chart
 *  (CRM dashboard redesign 2026-07-22): one grouped scan on the same
 *  `customers_intake_effective_idx` range predicate as the intake stats.
 *  Empty months are absent — the service zero-fills the series. */
export const countMonthlyIntake = async (
  db: Db,
  from: Date,
  to: Date,
): Promise<TrendPoint[]> => {
  return db
    .select({
      month: monthKey,
      leads: sql<number>`(count(*) filter (where ${customers.status} = ${CustomerStatus.Lead}))::int`,
      active: sql<number>`(count(*) filter (where ${customers.status} = ${CustomerStatus.Active}))::int`,
    })
    .from(customers)
    .where(
      and(
        isNull(customers.deletedAt),
        inArray(customers.status, [CustomerStatus.Lead, CustomerStatus.Active]),
        inWindow({ from, to }),
      ),
    )
    .groupBy(monthKey)
    .orderBy(monthKey);
};

// Agenda scope: live customers with a scheduled follow-up. Blacklisted rows
// keep their (stale) date but never nag from the dashboard.
const followUpScope = and(
  isNull(customers.deletedAt),
  isNotNull(customers.nextFollowUpAt),
  ne(customers.status, CustomerStatus.Blacklisted),
);

/** Soonest/most-overdue first — the dashboard agenda card (2026-07-22). */
export const listFollowUps = async (db: Db, limit: number): Promise<FollowUpRow[]> => {
  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      status: customers.status,
      source: customers.source,
      nextFollowUpAt: customers.nextFollowUpAt,
    })
    .from(customers)
    .where(followUpScope)
    .orderBy(asc(customers.nextFollowUpAt))
    .limit(limit);
  // The isNotNull predicate guarantees the date — narrow it for the DTO;
  // NULL legacy sources bucket as `other` (intake-stats convention).
  return rows.map((row) => ({
    ...row,
    source: row.source ?? CustomerSource.Other,
    nextFollowUpAt: row.nextFollowUpAt as Date,
  }));
};

/** Whole-scope aggregates for the follow-ups KPI (not just the page). */
export const countFollowUps = async (
  db: Db,
): Promise<{ overdue: number; scheduled: number }> => {
  const [row] = await db
    .select({
      overdue: sql<number>`(count(*) filter (where ${customers.nextFollowUpAt} < now()))::int`,
      scheduled: sql<number>`count(*)::int`,
    })
    .from(customers)
    .where(followUpScope);
  return row ?? { overdue: 0, scheduled: 0 };
};

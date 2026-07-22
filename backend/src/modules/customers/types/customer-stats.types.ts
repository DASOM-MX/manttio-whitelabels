import type { CustomerSource, CustomerStatus } from '../enums/customers.enum';

/** One grouped row from the single-scan intake query: all four buckets per
 *  source (FILTER aggregates — perf revision 2026-07-21). `source` is typed
 *  nullable defensively (pre-column legacy rows) — the service buckets NULL
 *  as `other`, never drops it. */
export interface IntakeSourceCounts {
  source: CustomerSource | null;
  leads: number;
  active: number;
  prevLeads: number;
  prevActive: number;
}

/** Half-open range: `from` inclusive, `to` exclusive. */
export interface IntakePeriod {
  from: Date;
  to: Date;
}

export interface IntakeSourceRow {
  source: CustomerSource;
  leads: number;
  active: number;
  prevLeads: number;
  prevActive: number;
}

export interface IntakeTotals {
  leads: number;
  active: number;
  prevLeads: number;
  prevActive: number;
}

/** Response of GET /customers/stats/intake (utm-params 03 CP-1). */
export interface IntakeStatsResponse {
  period: IntakePeriod;
  previous: IntakePeriod;
  totals: IntakeTotals;
  rows: IntakeSourceRow[];
}

/** One month bucket of the intake trend — `month` is the UTC 'YYYY-MM' key.
 *  Same snapshot semantics as the intake stats: a customer counts in the
 *  month its *current* status took effect. */
export interface TrendPoint {
  month: string;
  leads: number;
  active: number;
}

/** Response of GET /customers/stats/trend (CRM dashboard redesign
 *  2026-07-22): a continuous, zero-filled monthly series ending at the
 *  current month. */
export interface IntakeTrendResponse {
  months: TrendPoint[];
}

/** One agenda row of GET /customers/follow-ups: a live (non-blacklisted)
 *  customer with a scheduled follow-up, soonest/most-overdue first. NULL
 *  legacy sources are bucketed as `other`, like the intake stats. */
export interface FollowUpRow {
  id: string;
  name: string;
  status: CustomerStatus;
  source: CustomerSource;
  nextFollowUpAt: Date;
}

/** Response of GET /customers/follow-ups. Counts aggregate the whole scope,
 *  not just the returned page — the dashboard KPI needs the true totals. */
export interface FollowUpsResponse {
  items: FollowUpRow[];
  overdueCount: number;
  scheduledCount: number;
}

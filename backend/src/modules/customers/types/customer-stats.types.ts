import type { CustomerSource } from '../enums/customers.enum';

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

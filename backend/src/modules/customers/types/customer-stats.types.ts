import type { CustomerSource, CustomerStatus } from '../enums/customers.enum';

/** One grouped row from the intake count query. `source` is typed nullable
 *  defensively (pre-column legacy rows) — the service buckets NULL as `other`,
 *  never drops it. */
export interface IntakeCountRow {
  source: CustomerSource | null;
  status: CustomerStatus;
  count: number;
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

/** Response of GET /customers/stats/intake (utm-params 03 CP-1). */
export interface IntakeStatsResponse {
  period: IntakePeriod;
  previous: IntakePeriod;
  totals: { leads: number; active: number; prevLeads: number; prevActive: number };
  rows: IntakeSourceRow[];
}

import type { CustomerSource, CustomerStatus } from './customer';
import type { Interaction } from './interaction';

/** Response shapes of the Panel reads (utm-params 03): `GET
 *  /customers/stats/intake` plus the two amendment feeds. Dates are ISO
 *  strings; periods are half-open ranges (`from` inclusive, `to` exclusive). */

export interface IntakePeriod {
  from: string;
  to: string;
}

export interface IntakeTotals {
  leads: number;
  active: number;
  prevLeads: number;
  prevActive: number;
}

export interface IntakeSourceRow {
  source: CustomerSource;
  leads: number;
  active: number;
  prevLeads: number;
  prevActive: number;
}

export interface IntakeStats {
  period: IntakePeriod;
  previous: IntakePeriod;
  totals: IntakeTotals;
  rows: IntakeSourceRow[];
}

/** `GET /customers/interactions/recent` — tenant-wide feed row: the timeline
 *  entry plus the customer it belongs to, for linking out of the Panel. The
 *  status rides along for the activity table's Estatus column (2026-07-22). */
export interface RecentInteraction extends Interaction {
  customerName: string;
  customerStatus: CustomerStatus;
}

/** `GET /customers/recent` — newest registered clients, display fields only.
 *  `name` is the commercial/display name; business rows carry the person who
 *  registered in `contactName`. */
export interface RecentCustomer {
  id: string;
  name: string;
  contactName: string | null;
  clientType: 'person' | 'business' | null;
  source: CustomerSource;
  createdAt: string;
}

export interface RecentItemsResponse<T> {
  items: T[];
}

/** `GET /customers/stats/trend` (dashboard redesign 2026-07-22) — zero-filled
 *  monthly series ending at the current (MTD) month; `month` is the UTC
 *  'YYYY-MM' bucket key. Same snapshot semantics as the intake stats. */
export interface TrendPoint {
  month: string;
  leads: number;
  active: number;
}

export interface IntakeTrend {
  months: TrendPoint[];
}

/** `GET /customers/follow-ups` — one agenda row: a live customer with a
 *  scheduled follow-up, soonest/most-overdue first. */
export interface FollowUpCustomer {
  id: string;
  name: string;
  status: CustomerStatus;
  source: CustomerSource;
  nextFollowUpAt: string;
}

/** Counts aggregate the whole scope, not just the returned page — the
 *  dashboard KPI needs the true totals. */
export interface FollowUpsResponse {
  items: FollowUpCustomer[];
  overdueCount: number;
  scheduledCount: number;
}

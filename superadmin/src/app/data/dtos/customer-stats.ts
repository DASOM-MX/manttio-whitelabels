import type { CustomerSource } from './customer';
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
 *  entry plus the customer it belongs to, for linking out of the Panel. */
export interface RecentInteraction extends Interaction {
  customerName: string;
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

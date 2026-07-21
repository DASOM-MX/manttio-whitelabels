import type { Db } from '../../database/client';
import { CustomerSource, CustomerStatus } from '../enums/customers.enum';
import { countIntakeBySource } from '../repository/customer-stats.repository';
import type {
  IntakeCountRow,
  IntakeSourceRow,
  IntakeStatsResponse,
} from '../types/customer-stats.types';

// Month boundaries are tenant-agnostic UTC for v1 (utm-params 03: coarse but
// acceptable at monthly granularity; the tenant-level timezone can refine later).
const monthStartUTC = (year: number, monthIndex: number) => new Date(Date.UTC(year, monthIndex, 1));

const buildRanges = (month?: string) => {
  const now = new Date();
  let year: number;
  let mon: number; // 1–12, pre-validated by the query schema
  if (month) {
    year = Number(month.slice(0, 4));
    mon = Number(month.slice(5, 7));
  } else {
    year = now.getUTCFullYear();
    mon = now.getUTCMonth() + 1;
  }
  const start = monthStartUTC(year, mon - 1);
  const nextStart = monthStartUTC(year, mon);
  // The current calendar month reads month-to-date; a past month reads in full.
  const to = nextStart < now ? nextStart : now;
  return {
    period: { from: start, to },
    previous: { from: monthStartUTC(year, mon - 2), to: start },
  };
};

const tally = (rows: IntakeCountRow[]) => {
  const bySource = new Map<CustomerSource, { leads: number; active: number }>();
  for (const row of rows) {
    const source = row.source ?? CustomerSource.Other;
    const entry = bySource.get(source) ?? { leads: 0, active: 0 };
    if (row.status === CustomerStatus.Lead) entry.leads += row.count;
    else entry.active += row.count;
    bySource.set(source, entry);
  }
  return bySource;
};

/** Leads/actives per acquisition channel: the requested month (MTD when it's
 *  the current one) vs the full previous month. Snapshot semantics — a row
 *  counts in the period its *current* status took effect (utm-params 03). */
export const getIntakeStats = async (db: Db, month?: string): Promise<IntakeStatsResponse> => {
  const { period, previous } = buildRanges(month);
  const [current, prev] = await Promise.all([
    countIntakeBySource(db, period.from, period.to),
    countIntakeBySource(db, previous.from, previous.to),
  ]);
  const currentBySource = tally(current);
  const prevBySource = tally(prev);

  const sources = new Set<CustomerSource>([...currentBySource.keys(), ...prevBySource.keys()]);
  const rows: IntakeSourceRow[] = [...sources]
    .map((source) => {
      const cur = currentBySource.get(source) ?? { leads: 0, active: 0 };
      const before = prevBySource.get(source) ?? { leads: 0, active: 0 };
      return {
        source,
        leads: cur.leads,
        active: cur.active,
        prevLeads: before.leads,
        prevActive: before.active,
      };
    })
    .sort(
      (a, b) =>
        b.leads + b.active - (a.leads + a.active) ||
        b.prevLeads + b.prevActive - (a.prevLeads + a.prevActive),
    );

  const totals = rows.reduce(
    (acc, r) => ({
      leads: acc.leads + r.leads,
      active: acc.active + r.active,
      prevLeads: acc.prevLeads + r.prevLeads,
      prevActive: acc.prevActive + r.prevActive,
    }),
    { leads: 0, active: 0, prevLeads: 0, prevActive: 0 },
  );

  return { period, previous, totals, rows };
};

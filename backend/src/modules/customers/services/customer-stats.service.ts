import type { Db } from '../../database/client';
import { CustomerSource } from '../enums/customers.enum';
import {
  countFollowUps,
  countIntakeBySource,
  countMonthlyIntake,
  listFollowUps,
} from '../repository/customer-stats.repository';
import type {
  FollowUpsResponse,
  IntakeSourceRow,
  IntakeStatsResponse,
  IntakeTotals,
  IntakeTrendResponse,
  TrendPoint,
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

/** Leads/actives per acquisition channel: the requested month (MTD when it's
 *  the current one) vs the full previous month, from ONE grouped query
 *  (FILTER buckets — perf revision 2026-07-21). Snapshot semantics — a row
 *  counts in the period its *current* status took effect (utm-params 03). */
export const getIntakeStats = async (db: Db, month?: string): Promise<IntakeStatsResponse> => {
  const { period, previous } = buildRanges(month);
  const raw = await countIntakeBySource(db, period, previous);

  // Merge NULL-source legacy rows into `other`; drop all-zero rows (none
  // exist while the windows stay contiguous — defensive for future filters).
  const bySource = new Map<CustomerSource, IntakeSourceRow>();
  for (const row of raw) {
    const source = row.source ?? CustomerSource.Other;
    const entry =
      bySource.get(source) ?? { source, leads: 0, active: 0, prevLeads: 0, prevActive: 0 };
    entry.leads += row.leads;
    entry.active += row.active;
    entry.prevLeads += row.prevLeads;
    entry.prevActive += row.prevActive;
    bySource.set(source, entry);
  }
  const rows: IntakeSourceRow[] = [...bySource.values()]
    .filter((r) => r.leads + r.active + r.prevLeads + r.prevActive > 0)
    .sort(
      (a, b) =>
        b.leads + b.active - (a.leads + a.active) ||
        b.prevLeads + b.prevActive - (a.prevLeads + a.prevActive),
    );

  const totals = rows.reduce<IntakeTotals>(
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

/** Monthly intake series for the dashboard trend chart (CRM dashboard
 *  redesign 2026-07-22): the last `months` calendar months ending at the
 *  current one (MTD), zero-filled so the x-axis stays continuous. Same
 *  snapshot semantics as the intake stats. */
export const getIntakeTrend = async (db: Db, months: number): Promise<IntakeTrendResponse> => {
  const now = new Date();
  const start = monthStartUTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1));
  const raw = await countMonthlyIntake(db, start, now);
  const byMonth = new Map(raw.map((point) => [point.month, point]));

  const series: TrendPoint[] = [];
  for (let i = 0; i < months; i++) {
    const bucket = monthStartUTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1) + i);
    const key = `${bucket.getUTCFullYear()}-${String(bucket.getUTCMonth() + 1).padStart(2, '0')}`;
    series.push(byMonth.get(key) ?? { month: key, leads: 0, active: 0 });
  }
  return { months: series };
};

/** Follow-up agenda + whole-scope counts for the dashboard (2026-07-22). */
export const getFollowUps = async (db: Db, limit: number): Promise<FollowUpsResponse> => {
  const [items, counts] = await Promise.all([listFollowUps(db, limit), countFollowUps(db)]);
  return { items, overdueCount: counts.overdue, scheduledCount: counts.scheduled };
};

import { describe, expect, test } from 'vitest';
import { authHeader, env, json, jsonHeaders, request } from './helpers/request';
import {
  seedAdminAndLogin,
  seedCustomer,
  seedTechnicianAndLogin,
  uniqueName,
  uniqueRecipientEmail,
} from './helpers/fixtures';
import { createDb } from '../src/modules/database/client';
import { insertCustomer } from '../src/modules/customers/repository/customers.repository';
import { CustomerSource, CustomerStatus } from '../src/modules/customers/enums/customers.enum';

type WorkerEnv = { DATABASE_URL: string };

type IntakeRow = {
  source: string;
  leads: number;
  active: number;
  prevLeads: number;
  prevActive: number;
};

type IntakeStats = {
  period: { from: string; to: string };
  previous: { from: string; to: string };
  totals: { leads: number; active: number; prevLeads: number; prevActive: number };
  rows: IntakeRow[];
};

type RecentItem = {
  id: string;
  customerId: string;
  customerName: string;
  type: string;
  body: string;
  userName?: string;
  createdAt: string;
};

const db = () => createDb((env as WorkerEnv).DATABASE_URL);

// Fixture rows are planted in a fixed past month (May/April 2020 — predates any
// real data) so the ranges are deterministic; assertions are still delta-based
// (before vs after seeding) so accumulated fixtures from prior runs never skew.
const MONTH = '2020-05';

const seedIntakeCustomer = (opts: {
  source: CustomerSource;
  status: CustomerStatus;
  createdAt: Date;
  statusChangedAt?: Date;
  deletedAt?: Date;
}) =>
  insertCustomer(db(), {
    name: uniqueName('intake'),
    email: uniqueRecipientEmail('intake'),
    source: opts.source,
    status: opts.status,
    createdAt: opts.createdAt,
    statusChangedAt: opts.statusChangedAt ?? null,
    deletedAt: opts.deletedAt ?? null,
  });

const fetchIntake = async (token: string, month?: string): Promise<IntakeStats> => {
  const qs = month ? `?month=${month}` : '';
  const res = await request(`/customers/stats/intake${qs}`, { headers: authHeader(token) });
  expect(res.status).toBe(200);
  return json<IntakeStats>(res);
};

const zeroRow = (source: string): IntakeRow => ({
  source,
  leads: 0,
  active: 0,
  prevLeads: 0,
  prevActive: 0,
});

const rowFor = (stats: IntakeStats, source: string): IntakeRow =>
  stats.rows.find((r) => r.source === source) ?? zeroRow(source);

describe('GET /customers/stats/intake', () => {
  test('buckets by source × status with coalesce(status_changed_at, created_at)', async () => {
    const { token } = await seedAdminAndLogin();
    const before = await fetchIntake(token, MONTH);

    // Period = full May 2020 (past month); previous = full April 2020.
    // 1) Lead born in May, birth status (NULL status_changed_at) → May leads.
    await seedIntakeCustomer({
      source: CustomerSource.Facebook,
      status: CustomerStatus.Lead,
      createdAt: new Date('2020-05-10T12:00:00Z'),
    });
    // 2) Born in April as a lead, converted in May → counts as May active only;
    //    its April lead history is invisible (snapshot semantics).
    await seedIntakeCustomer({
      source: CustomerSource.Google,
      status: CustomerStatus.Active,
      createdAt: new Date('2020-04-05T12:00:00Z'),
      statusChangedAt: new Date('2020-05-15T12:00:00Z'),
    });
    // 3) Lead born in April, still a lead → previous-month leads.
    await seedIntakeCustomer({
      source: CustomerSource.Facebook,
      status: CustomerStatus.Lead,
      createdAt: new Date('2020-04-20T12:00:00Z'),
    });
    // 4) Disabled row in May → excluded (only lead/active count).
    await seedIntakeCustomer({
      source: CustomerSource.Facebook,
      status: CustomerStatus.Disabled,
      createdAt: new Date('2020-05-11T12:00:00Z'),
    });
    // 5) Soft-deleted May lead → excluded everywhere.
    await seedIntakeCustomer({
      source: CustomerSource.Facebook,
      status: CustomerStatus.Lead,
      createdAt: new Date('2020-05-12T12:00:00Z'),
      deletedAt: new Date('2020-05-13T12:00:00Z'),
    });

    const after = await fetchIntake(token, MONTH);

    const fbBefore = rowFor(before, CustomerSource.Facebook);
    const fbAfter = rowFor(after, CustomerSource.Facebook);
    expect(fbAfter.leads - fbBefore.leads).toBe(1);
    expect(fbAfter.active - fbBefore.active).toBe(0);
    expect(fbAfter.prevLeads - fbBefore.prevLeads).toBe(1);

    const gBefore = rowFor(before, CustomerSource.Google);
    const gAfter = rowFor(after, CustomerSource.Google);
    expect(gAfter.active - gBefore.active).toBe(1);
    expect(gAfter.leads - gBefore.leads).toBe(0);
    expect(gAfter.prevLeads - gBefore.prevLeads).toBe(0);
    expect(gAfter.prevActive - gBefore.prevActive).toBe(0);

    expect(after.totals.leads - before.totals.leads).toBe(1);
    expect(after.totals.active - before.totals.active).toBe(1);
    expect(after.totals.prevLeads - before.totals.prevLeads).toBe(1);
    expect(after.totals.prevActive - before.totals.prevActive).toBe(0);

    // A past month reads in full; previous is always the full prior month.
    expect(after.period.from).toBe('2020-05-01T00:00:00.000Z');
    expect(after.period.to).toBe('2020-06-01T00:00:00.000Z');
    expect(after.previous.from).toBe('2020-04-01T00:00:00.000Z');
    expect(after.previous.to).toBe('2020-05-01T00:00:00.000Z');

    // Rows come ordered by current-period volume, descending.
    const volumes = after.rows.map((r) => r.leads + r.active);
    expect([...volumes].sort((a, b) => b - a)).toEqual(volumes);

    // NULL-source → 'other' bucketing lives in the service but is not seedable
    // here: the live column is NOT NULL with default 'other'.
  });

  test('defaults to the current month (MTD) when month is omitted', async () => {
    const { token } = await seedAdminAndLogin();
    const stats = await fetchIntake(token);
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString();
    expect(stats.period.from).toBe(monthStart);
    // MTD: the period closes at "now", inside the current month.
    expect(new Date(stats.period.to).getTime()).toBeLessThanOrEqual(Date.now());
    expect(stats.previous.to).toBe(monthStart);
  });

  test('technician is rejected (owner/admin gate)', async () => {
    const { token } = await seedTechnicianAndLogin();
    const res = await request('/customers/stats/intake', { headers: authHeader(token) });
    expect(res.status).toBe(403);
  });

  test('malformed month is rejected with 400', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/customers/stats/intake?month=2020-13', {
      headers: authHeader(token),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /customers/interactions/recent', () => {
  test('returns newest-first entries carrying the customer name', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const created = await request(`/customers/${customer.id}/interactions`, {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify({ type: 'note', body: 'seguimiento de prueba' }),
    });
    expect(created.status).toBe(201);

    // The just-created entry is the newest row tenant-wide, so it must be in
    // the first page regardless of what other fixtures/data exist.
    const res = await request('/customers/interactions/recent?limit=50', {
      headers: authHeader(token),
    });
    expect(res.status).toBe(200);
    const body = await json<{ items: RecentItem[] }>(res);
    const mine = body.items.find((i) => i.customerId === customer.id);
    expect(mine).toBeDefined();
    expect(mine?.customerName).toBe(customer.name);
    expect(mine?.type).toBe('note');

    const times = body.items.map((i) => new Date(i.createdAt).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  test('entries of a soft-deleted customer leave the feed', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const created = await request(`/customers/${customer.id}/interactions`, {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify({ type: 'call', body: 'llamada previa al borrado' }),
    });
    expect(created.status).toBe(201);

    const del = await request(`/customers/${customer.id}`, {
      method: 'DELETE',
      headers: authHeader(token),
    });
    expect(del.status).toBe(200);

    const res = await request('/customers/interactions/recent?limit=50', {
      headers: authHeader(token),
    });
    expect(res.status).toBe(200);
    const body = await json<{ items: RecentItem[] }>(res);
    expect(body.items.some((i) => i.customerId === customer.id)).toBe(false);
  });

  test('technician is rejected (owner/admin gate)', async () => {
    const { token } = await seedTechnicianAndLogin();
    const res = await request('/customers/interactions/recent', {
      headers: authHeader(token),
    });
    expect(res.status).toBe(403);
  });
});

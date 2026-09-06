import { afterAll, describe, expect, test } from 'vitest';
import { and, eq, inArray, isNull, like } from 'drizzle-orm';
import { env, json, jsonHeaders, request } from './helpers/request';
import {
  seedAdminAndLogin,
  seedCustomer,
  seedOfficeAndLogin,
  seedOwnerAndLogin,
  seedTechnician,
  seedTechnicianAndLogin,
  serviceFixturePrefix,
  uniqueServiceName,
} from './helpers/fixtures';
import { createDb } from '../src/modules/database/client';
import {
  customers,
  scheduledVisits,
  serviceOrderServices,
  serviceOrders,
  services,
} from '../src/modules/database/schema';
import { ServiceTaxRate, ServiceUom } from '../src/modules/services/enums/services.enum';
import {
  ServiceOrderEventType,
  ServiceOrderStatus,
} from '../src/modules/service-orders/enums/service-orders.enum';
import { VisitCloseReason, VisitStatus } from '../src/modules/visits/enums/visits.enum';

type WorkerEnv = { DATABASE_URL: string };

// Memoized: `bookVisit` reaches for this on every call, and a fresh pool per
// call would open one connection per fixture visit.
let pool: ReturnType<typeof createDb> | undefined;
const db = () => (pool ??= createDb((env as unknown as WorkerEnv).DATABASE_URL));

type Visit = {
  id: string;
  internalCode: string;
  customerId: string;
  serviceOrderId?: string;
  technicianId?: string;
  scheduledStart: string;
  scheduledEnd?: string;
  expectedDurationMinutes: number;
  actualStart?: string;
  actualEnd?: string;
  actualDurationMinutes?: number;
  status: VisitStatus;
  closeReason?: VisitCloseReason;
  rescheduledFromId?: string;
  title?: string;
  notes?: string;
};

type TimelineEvent = {
  type: ServiceOrderEventType;
  ref?: { kind: string; id: string };
  changes?: Record<string, { from: unknown; to: unknown }>;
  note?: string;
};

// Visits hang off the suite's `test-%` customers, so cleanup soft-deletes every
// visit belonging to one, then the orders and catalog services they were built
// from. Per the no-hard-delete rule the rows stay — they simply leave every read
// path via `isNull(deletedAt)`. `visit_equipment` and `service_order_events` are
// link/append-only tables and are deliberately left untouched.
afterAll(async () => {
  const conn = db();

  const fixtureCustomers = await conn
    .select({ id: customers.id })
    .from(customers)
    .where(like(customers.name, 'test-%'));
  const customerIds = fixtureCustomers.map((c) => c.id);
  if (customerIds.length > 0) {
    await conn
      .update(scheduledVisits)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(inArray(scheduledVisits.customerId, customerIds), isNull(scheduledVisits.deletedAt)),
      );
  }

  const fixtureServices = await conn
    .select({ id: services.id })
    .from(services)
    .where(like(services.name, `${serviceFixturePrefix('visit-svc')}%`));
  const serviceIds = fixtureServices.map((s) => s.id);
  if (serviceIds.length > 0) {
    const lines = await conn
      .select({ orderId: serviceOrderServices.serviceOrderId })
      .from(serviceOrderServices)
      .where(inArray(serviceOrderServices.serviceId, serviceIds));
    const orderIds = [...new Set(lines.map((l) => l.orderId))];
    if (orderIds.length > 0) {
      await conn
        .update(serviceOrders)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(inArray(serviceOrders.id, orderIds), isNull(serviceOrders.deletedAt)));
    }
  }

  await conn
    .update(services)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(like(services.name, `${serviceFixturePrefix('visit-svc')}%`), isNull(services.deletedAt)));
});

// --- helpers -------------------------------------------------------------

/** Fixed points in time, far enough from `now` that nothing here depends on the
 *  wall clock. Visits are scheduled in 2099 for the same reason report fixtures
 *  are: they cannot collide with real data, and no real calendar week shows
 *  them. */
const START = '2099-06-15T09:00:00.000Z';
const START_MS = Date.parse(START);
const minutesAfterStart = (m: number) => new Date(START_MS + m * 60_000).toISOString();

/** Actual stamps must be in the past and after the visit's `created_at`, so they
 *  are anchored to `now` rather than to 2099. */
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

/** How far back `bookVisit` back-dates a fixture visit's `created_at`.
 *
 *  `assertPlausibleActual` floors every actual stamp at the visit's own
 *  `created_at` — a stamp from before the visit existed is a broken clock. In
 *  production that floor is hours or days behind the work, because office books
 *  a visit before a technician performs it. A visit created by the request two
 *  lines up was created *this second*, so without back-dating there is no
 *  timestamp that is simultaneously in the past (not a future stamp) and after
 *  creation — every realistic Iniciar/Terminar would 400, and no duration
 *  longer than the test's own runtime could be asserted at all.
 *
 *  So: book it, then say it was booked yesterday. Everything anchored to
 *  `minutesAgo` then sits in the same window a real visit's actuals do. */
const BOOKED_MS_AGO = 24 * 60 * 60_000;

/** Age a fixture visit so its actual stamps can be realistically in the past. */
const backdateBooking = (visitId: string) =>
  db()
    .update(scheduledVisits)
    .set({ createdAt: new Date(Date.now() - BOOKED_MS_AGO) })
    .where(eq(scheduledVisits.id, visitId));

const createVisit = (token: string, body: object) =>
  request('/visits', { method: 'POST', headers: jsonHeaders(token), body: JSON.stringify(body) });

const post = (token: string, path: string, body: object) =>
  request(`/visits/${path}`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(body),
  });

const patch = (token: string, path: string, body: object) =>
  request(`/visits/${path}`, {
    method: 'PATCH',
    headers: jsonHeaders(token),
    body: JSON.stringify(body),
  });

const seedService = async (token: string) => {
  const res = await request('/services', {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({
      name: uniqueServiceName('visit-svc'),
      price: 1000,
      uom: ServiceUom.Servicio,
      taxRate: ServiceTaxRate.Iva16,
    }),
  });
  expect(res.status).toBe(201);
  return json<{ id: string }>(res);
};

/** An admin, a customer, a technician and an open order to hang visits on — the
 *  order is what makes the audit trail observable, since visits have no event
 *  table of their own (12 §1). */
const scenario = async () => {
  const { admin, token } = await seedAdminAndLogin();
  const customer = await seedCustomer();
  const tech = await seedTechnician();
  const service = await seedService(token);

  const res = await request('/service-orders', {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({
      customerId: customer.id,
      // `quantity` is a decimal string since line model v2, and the line
      // explodes nothing (the seeded service is not a report source), so it
      // needs neither a technician's template nor a report count.
      lines: [{ serviceId: service.id, quantity: '1', technicianId: tech.id }],
    }),
  });
  expect(res.status).toBe(201);
  const { order } = await json<{ order: { id: string } }>(res);

  return { admin, token, customer, tech, order };
};

/** A `scheduled` visit bound to the scenario's order, assigned to its tech. */
const bookVisit = async (
  ctx: Awaited<ReturnType<typeof scenario>>,
  over: { expectedDurationMinutes?: number; technicianId?: string } = {},
) => {
  const res = await createVisit(ctx.token, {
    customerId: ctx.customer.id,
    serviceOrderId: ctx.order.id,
    technicianId: over.technicianId ?? ctx.tech.id,
    scheduledStart: START,
    ...(over.expectedDurationMinutes ? { expectedDurationMinutes: over.expectedDurationMinutes } : {}),
  });
  expect(res.status).toBe(201);
  const visit = await json<Visit>(res);
  await backdateBooking(visit.id);
  return visit;
};

const getTimeline = async (token: string, orderId: string) => {
  const res = await request(`/service-orders/${orderId}/timeline?limit=50`, {
    headers: jsonHeaders(token),
  });
  expect(res.status).toBe(200);
  return (await json<{ items: TimelineEvent[] }>(res)).items;
};

// --- create + planned window --------------------------------------------

describe('POST /visits', () => {
  test('defaults to a 60-minute block and derives scheduledEnd from it', async () => {
    const ctx = await scenario();
    const visit = await bookVisit(ctx);

    expect(visit.expectedDurationMinutes).toBe(60);
    expect(visit.scheduledStart).toBe(START);
    expect(visit.scheduledEnd).toBe(minutesAfterStart(60));
    expect(visit.status).toBe(VisitStatus.Scheduled);
    // Nothing has happened yet, so there is nothing truthful to report.
    expect(visit.actualStart).toBeUndefined();
    expect(visit.actualEnd).toBeUndefined();
    expect(visit.actualDurationMinutes).toBeUndefined();
  });

  test('an explicit duration drives the derived end', async () => {
    const ctx = await scenario();
    const visit = await bookVisit(ctx, { expectedDurationMinutes: 150 });

    expect(visit.expectedDurationMinutes).toBe(150);
    expect(visit.scheduledEnd).toBe(minutesAfterStart(150));
  });

  test('mints a V-YYYYMMDD-NNNN code and logs visit_created to the order timeline', async () => {
    const ctx = await scenario();
    const visit = await bookVisit(ctx);

    expect(visit.internalCode).toMatch(/^V-\d{8}-\d{4}$/);

    const events = await getTimeline(ctx.token, ctx.order.id);
    const created = events.find(
      (e) => e.type === ServiceOrderEventType.VisitCreated && e.ref?.id === visit.id,
    );
    expect(created).toBeDefined();
  });

  test('two visits never share a code', async () => {
    const ctx = await scenario();
    const [a, b] = await Promise.all([bookVisit(ctx), bookVisit(ctx)]);
    expect(a.internalCode).not.toBe(b.internalCode);
  });

  test('rejects a duration longer than a day — that is several visits, not one block', async () => {
    const ctx = await scenario();
    const res = await createVisit(ctx.token, {
      customerId: ctx.customer.id,
      serviceOrderId: ctx.order.id,
      scheduledStart: START,
      expectedDurationMinutes: 24 * 60 + 1,
    });
    expect(res.status).toBe(400);
  });
});

// --- reading -------------------------------------------------------------

describe('GET /visits', () => {
  test('reads a bounded range', async () => {
    const ctx = await scenario();
    const visit = await bookVisit(ctx);

    const res = await request(
      `/visits?from=${encodeURIComponent(minutesAfterStart(-60))}&to=${encodeURIComponent(minutesAfterStart(60))}&customerId=${ctx.customer.id}`,
      { headers: jsonHeaders(ctx.token) },
    );
    expect(res.status).toBe(200);
    const found = await json<Visit[]>(res);
    expect(found.map((v) => v.id)).toContain(visit.id);
  });

  test('finds a visit by code prefix with no date range at all', async () => {
    const ctx = await scenario();
    const visit = await bookVisit(ctx);

    // The whole point of the code: you can find the visit without already
    // knowing which week it is in.
    const res = await request(`/visits?internalCode=${visit.internalCode}`, {
      headers: jsonHeaders(ctx.token),
    });
    expect(res.status).toBe(200);
    const found = await json<Visit[]>(res);
    expect(found).toHaveLength(1);
    expect(found[0]!.id).toBe(visit.id);
  });

  test('a partial code prefix still matches', async () => {
    const ctx = await scenario();
    const visit = await bookVisit(ctx);
    const dayPrefix = visit.internalCode.slice(0, 'V-20990615'.length);

    const res = await request(`/visits?internalCode=${dayPrefix}`, {
      headers: jsonHeaders(ctx.token),
    });
    expect(res.status).toBe(200);
    const found = await json<Visit[]>(res);
    expect(found.map((v) => v.id)).toContain(visit.id);
  });

  test('a lower-cased code still matches — the term is normalized, not the query', async () => {
    const ctx = await scenario();
    const visit = await bookVisit(ctx);

    const res = await request(`/visits?internalCode=${visit.internalCode.toLowerCase()}`, {
      headers: jsonHeaders(ctx.token),
    });
    expect(res.status).toBe(200);
    expect((await json<Visit[]>(res)).map((v) => v.id)).toContain(visit.id);
  });

  test('refuses an unbounded scan — neither a range nor a code', async () => {
    const ctx = await scenario();
    const res = await request('/visits', { headers: jsonHeaders(ctx.token) });
    expect(res.status).toBe(400);
  });

  test('a LIKE wildcard is not a code — `%` must not become "every visit ever"', async () => {
    const ctx = await scenario();
    await bookVisit(ctx);

    // The term reaches the repository as `LIKE '<term>%'`. Without an alphabet
    // check these two are an unbounded scan wearing a code filter, which is
    // exactly what requiring a range or a code exists to prevent.
    for (const wildcard of ['%', '_']) {
      const res = await request(`/visits?internalCode=${encodeURIComponent(wildcard)}`, {
        headers: jsonHeaders(ctx.token),
      });
      expect(res.status).toBe(400);
    }
  });
});

// --- correction ----------------------------------------------------------

describe('PATCH /visits/:id', () => {
  test('a new duration re-derives the end and lands in the timeline', async () => {
    const ctx = await scenario();
    const visit = await bookVisit(ctx);

    const res = await patch(ctx.token, visit.id, { expectedDurationMinutes: 30 });
    expect(res.status).toBe(200);
    const updated = await json<Visit>(res);
    expect(updated.expectedDurationMinutes).toBe(30);
    expect(updated.scheduledEnd).toBe(minutesAfterStart(30));

    const events = await getTimeline(ctx.token, ctx.order.id);
    const corrected = events.find(
      (e) => e.type === ServiceOrderEventType.VisitCorrected && e.ref?.id === visit.id,
    );
    expect(corrected?.changes?.expectedDurationMinutes).toEqual({ from: 60, to: 30 });
    // `scheduledEnd` is derived from the duration, so recording it too would put
    // the same move in the trail twice.
    expect(corrected?.changes?.scheduledEnd).toBeUndefined();
  });

  test('moving the start re-derives the end without being told the duration', async () => {
    const ctx = await scenario();
    const visit = await bookVisit(ctx, { expectedDurationMinutes: 90 });

    const res = await patch(ctx.token, visit.id, { scheduledStart: minutesAfterStart(120) });
    expect(res.status).toBe(200);
    const updated = await json<Visit>(res);
    expect(updated.scheduledEnd).toBe(minutesAfterStart(210));
  });
});

// --- Iniciar -------------------------------------------------------------

describe('POST /visits/:id/start', () => {
  test('stamps the client-supplied actualStart and moves to in_progress', async () => {
    const ctx = await scenario();
    const visit = await bookVisit(ctx);
    const tappedAt = minutesAgo(30);

    const res = await post(ctx.token, `${visit.id}/start`, { actualStart: tappedAt });
    expect(res.status).toBe(200);
    const started = await json<Visit>(res);

    expect(started.status).toBe(VisitStatus.InProgress);
    // The tap time, not the sync time — the whole reason this is client-supplied.
    expect(started.actualStart).toBe(tappedAt);
    expect(started.actualEnd).toBeUndefined();

    const events = await getTimeline(ctx.token, ctx.order.id);
    expect(
      events.some(
        (e) => e.type === ServiceOrderEventType.VisitStarted && e.ref?.id === visit.id,
      ),
    ).toBe(true);
  });

  test('trusted is not unchecked: a future stamp is refused', async () => {
    const ctx = await scenario();
    const visit = await bookVisit(ctx);

    const res = await post(ctx.token, `${visit.id}/start`, {
      actualStart: new Date(Date.now() + 60 * 60_000).toISOString(),
    });
    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe('invalid_actual_time');
  });

  test('a stamp from before the visit existed is refused', async () => {
    const ctx = await scenario();
    const visit = await bookVisit(ctx);

    const res = await post(ctx.token, `${visit.id}/start`, {
      actualStart: '2020-01-01T00:00:00.000Z',
    });
    expect(res.status).toBe(400);
  });

  test('a technician cannot start a colleague’s visit', async () => {
    const ctx = await scenario();
    const visit = await bookVisit(ctx);
    const { token: otherToken } = await seedTechnicianAndLogin();

    const res = await post(otherToken, `${visit.id}/start`, { actualStart: minutesAgo(5) });
    expect(res.status).toBe(403);
  });

  test('starting twice is refused — a duplicate offline entry must not reset the clock', async () => {
    const ctx = await scenario();
    const visit = await bookVisit(ctx);
    const first = minutesAgo(45);

    expect((await post(ctx.token, `${visit.id}/start`, { actualStart: first })).status).toBe(200);
    const res = await post(ctx.token, `${visit.id}/start`, { actualStart: minutesAgo(5) });
    expect(res.status).toBe(409);
    expect((await json<{ error: string }>(res)).error).toBe('visit_not_startable');

    const detail = await request(`/visits/${visit.id}`, { headers: jsonHeaders(ctx.token) });
    expect((await json<Visit>(detail)).actualStart).toBe(first);
  });
});

// --- the late half of the offline conflict rule (12 CP-3) -----------------
//
// The field app syncs queued taps in tap order, but a crash mid-sync can land a
// Terminar whose Iniciar is still queued. When that Iniciar finally arrives the
// visit is terminal with an actualEnd and no actualStart — and refusing it
// would throw away the only record of when the work began.

describe('a late Iniciar on a terminal visit', () => {
  test('backfills the missing actualStart and derives the duration', async () => {
    const ctx = await scenario();
    const visit = await bookVisit(ctx);
    const startedAt = minutesAgo(80);
    const endedAt = minutesAgo(20);

    // The Terminar outran its Iniciar: completed, end stamped, start missing.
    expect(
      (await post(ctx.token, `${visit.id}/respond`, { actualEnd: endedAt })).status,
    ).toBe(200);

    const res = await post(ctx.token, `${visit.id}/start`, { actualStart: startedAt });
    expect(res.status).toBe(200);
    const backfilled = await json<Visit>(res);

    // The stamp lands without reopening the visit.
    expect(backfilled.status).toBe(VisitStatus.Completed);
    expect(backfilled.actualStart).toBe(startedAt);
    expect(backfilled.actualEnd).toBe(endedAt);
    expect(backfilled.actualDurationMinutes).toBe(60);

    // The trail says what happened: a Started event after the Completed one,
    // carrying the backfilled stamp so it reads as a late sync, not a restart.
    const events = await getTimeline(ctx.token, ctx.order.id);
    const started = events.find(
      (e) => e.type === ServiceOrderEventType.VisitStarted && e.ref?.id === visit.id,
    );
    expect(started?.changes?.['actualStart']?.from).toBeNull();
  });

  test('also lands on a closed visit — the abandoned attempt stays visible', async () => {
    const ctx = await scenario();
    const visit = await bookVisit(ctx);
    expect(
      (
        await post(ctx.token, `${visit.id}/close`, { reason: VisitCloseReason.ClientAbsent })
      ).status,
    ).toBe(200);

    const res = await post(ctx.token, `${visit.id}/start`, { actualStart: minutesAgo(15) });
    expect(res.status).toBe(200);
    const backfilled = await json<Visit>(res);
    expect(backfilled.status).toBe(VisitStatus.Closed);
    expect(backfilled.actualStart).toBeDefined();
    // No end on a closed visit, so no duration materializes.
    expect(backfilled.actualDurationMinutes).toBeUndefined();
  });

  test('a start already on the record still wins — the late tap is a duplicate', async () => {
    const ctx = await scenario();
    const visit = await bookVisit(ctx);
    const first = minutesAgo(90);
    expect((await post(ctx.token, `${visit.id}/start`, { actualStart: first })).status).toBe(200);
    expect(
      (await post(ctx.token, `${visit.id}/respond`, { actualEnd: minutesAgo(30) })).status,
    ).toBe(200);

    const res = await post(ctx.token, `${visit.id}/start`, { actualStart: minutesAgo(10) });
    expect(res.status).toBe(409);
    expect((await json<{ error: string }>(res)).error).toBe('visit_not_startable');

    const detail = await request(`/visits/${visit.id}`, { headers: jsonHeaders(ctx.token) });
    expect((await json<Visit>(detail)).actualStart).toBe(first);
  });

  test('a backfilled start after the recorded end is refused', async () => {
    const ctx = await scenario();
    const visit = await bookVisit(ctx);
    expect(
      (await post(ctx.token, `${visit.id}/respond`, { actualEnd: minutesAgo(60) })).status,
    ).toBe(200);

    const res = await post(ctx.token, `${visit.id}/start`, { actualStart: minutesAgo(5) });
    expect(res.status).toBe(400);
    expect((await json<{ error: string }>(res)).error).toBe('invalid_actual_time');
  });
});

// --- what in_progress freezes, and what it does not ----------------------

describe('an in_progress visit', () => {
  const startIt = async (ctx: Awaited<ReturnType<typeof scenario>>) => {
    const visit = await bookVisit(ctx);
    const res = await post(ctx.token, `${visit.id}/start`, { actualStart: minutesAgo(30) });
    expect(res.status).toBe(200);
    return visit;
  };

  test('refuses a scheduling correction — you cannot move a job being performed', async () => {
    const ctx = await scenario();
    const visit = await startIt(ctx);

    const res = await patch(ctx.token, visit.id, { scheduledStart: minutesAfterStart(60) });
    expect(res.status).toBe(409);
    expect((await json<{ error: string }>(res)).error).toBe('visit_not_correctable');
  });

  test('still accepts a reassignment — a mid-job handoff is real', async () => {
    const ctx = await scenario();
    const visit = await startIt(ctx);
    const cover = await seedTechnician();

    const res = await post(ctx.token, `${visit.id}/assign`, { technicianId: cover.id });
    expect(res.status).toBe(200);
    const reassigned = await json<Visit>(res);
    expect(reassigned.technicianId).toBe(cover.id);
    expect(reassigned.status).toBe(VisitStatus.InProgress);

    const events = await getTimeline(ctx.token, ctx.order.id);
    expect(
      events.some(
        (e) => e.type === ServiceOrderEventType.VisitReassigned && e.ref?.id === visit.id,
      ),
    ).toBe(true);
  });

  test('can still be closed — a started job that cannot be finished has to be sayable', async () => {
    const ctx = await scenario();
    const visit = await startIt(ctx);

    const res = await post(ctx.token, `${visit.id}/close`, {
      reason: VisitCloseReason.NoAccess,
    });
    expect(res.status).toBe(200);
    const closed = await json<Visit>(res);
    expect(closed.status).toBe(VisitStatus.Closed);
    // The abandoned attempt stays visible.
    expect(closed.actualStart).toBeDefined();
  });
});

// --- Terminar ------------------------------------------------------------

describe('POST /visits/:id/respond', () => {
  test('stamps actualEnd and computes the real duration', async () => {
    const ctx = await scenario();
    const visit = await bookVisit(ctx);
    const startedAt = minutesAgo(95);
    const endedAt = minutesAgo(20);

    expect((await post(ctx.token, `${visit.id}/start`, { actualStart: startedAt })).status).toBe(200);

    const res = await post(ctx.token, `${visit.id}/respond`, { actualEnd: endedAt });
    expect(res.status).toBe(200);
    const done = await json<Visit>(res);

    expect(done.status).toBe(VisitStatus.Completed);
    expect(done.actualEnd).toBe(endedAt);
    expect(done.actualDurationMinutes).toBe(75);
    // Plan vs actual: booked for an hour, took an hour and a quarter.
    expect(done.expectedDurationMinutes).toBe(60);
  });

  test('completing without any Iniciar leaves the duration null rather than inventing one', async () => {
    const ctx = await scenario();
    const visit = await bookVisit(ctx);

    const res = await post(ctx.token, `${visit.id}/respond`, { actualEnd: minutesAgo(10) });
    expect(res.status).toBe(200);
    const done = await json<Visit>(res);

    expect(done.status).toBe(VisitStatus.Completed);
    expect(done.actualStart).toBeUndefined();
    expect(done.actualDurationMinutes).toBeUndefined();
  });

  test('office may complete a visit with no actuals at all', async () => {
    const ctx = await scenario();
    const visit = await bookVisit(ctx);

    const res = await post(ctx.token, `${visit.id}/respond`, {});
    expect(res.status).toBe(200);
    const done = await json<Visit>(res);
    expect(done.status).toBe(VisitStatus.Completed);
    expect(done.actualEnd).toBeUndefined();
  });

  test('an end before the recorded start is refused', async () => {
    const ctx = await scenario();
    const visit = await bookVisit(ctx);
    expect((await post(ctx.token, `${visit.id}/start`, { actualStart: minutesAgo(30) })).status).toBe(200);

    const res = await post(ctx.token, `${visit.id}/respond`, { actualEnd: minutesAgo(90) });
    expect(res.status).toBe(400);
    expect((await json<{ error: string }>(res)).error).toBe('invalid_actual_time');
  });
});

// --- correcting the actuals ---------------------------------------------

describe('PATCH /visits/:id/actuals', () => {
  /** A completed visit with both stamps — the only state the correction accepts. */
  const completed = async (ctx: Awaited<ReturnType<typeof scenario>>) => {
    const visit = await bookVisit(ctx);
    expect((await post(ctx.token, `${visit.id}/start`, { actualStart: minutesAgo(120) })).status).toBe(200);
    expect((await post(ctx.token, `${visit.id}/respond`, { actualEnd: minutesAgo(60) })).status).toBe(200);
    return visit;
  };

  test('an owner fixes a mis-tapped start, and the duration follows', async () => {
    const ctx = await scenario();
    const visit = await completed(ctx);
    const { token: ownerToken } = await seedOwnerAndLogin();

    const res = await patch(ownerToken, `${visit.id}/actuals`, { actualStart: minutesAgo(90) });
    expect(res.status).toBe(200);
    const fixed = await json<Visit>(res);
    expect(fixed.actualDurationMinutes).toBe(30);
    expect(fixed.status).toBe(VisitStatus.Completed);
  });

  test('the trail keeps both the original stamp and the fix', async () => {
    const ctx = await scenario();
    const visit = await completed(ctx);
    const { admin: _admin, token: adminToken } = await seedAdminAndLogin();
    const corrected = minutesAgo(90);

    expect((await patch(adminToken, `${visit.id}/actuals`, { actualStart: corrected })).status).toBe(200);

    const events = await getTimeline(ctx.token, ctx.order.id);
    const event = events.find(
      (e) => e.type === ServiceOrderEventType.VisitActualsCorrected && e.ref?.id === visit.id,
    );
    expect(event).toBeDefined();
    // What makes rewriting a technician's record acceptable: the original is
    // still readable.
    expect(event?.changes?.actualStart?.to).toBe(corrected);
    expect(event?.changes?.actualStart?.from).not.toBe(corrected);
  });

  test('office cannot — rewriting recorded work is a billing-grade edit', async () => {
    const ctx = await scenario();
    const visit = await completed(ctx);
    const { token: officeToken } = await seedOfficeAndLogin();

    const res = await patch(officeToken, `${visit.id}/actuals`, { actualStart: minutesAgo(90) });
    expect(res.status).toBe(403);
  });

  test('refuses a visit that is not terminal — let Terminar record the truth instead', async () => {
    const ctx = await scenario();
    const visit = await bookVisit(ctx);
    const { token: ownerToken } = await seedOwnerAndLogin();

    const res = await patch(ownerToken, `${visit.id}/actuals`, { actualStart: minutesAgo(30) });
    expect(res.status).toBe(409);
    expect((await json<{ error: string }>(res)).error).toBe('visit_not_terminal');
  });

  test('refuses an incoherent pair', async () => {
    const ctx = await scenario();
    const visit = await completed(ctx);
    const { token: ownerToken } = await seedOwnerAndLogin();

    const res = await patch(ownerToken, `${visit.id}/actuals`, { actualEnd: minutesAgo(180) });
    expect(res.status).toBe(400);
  });
});

// --- reschedule ----------------------------------------------------------

describe('POST /visits/:id/reschedule', () => {
  test('the successor inherits the planned duration and gets its own code', async () => {
    const ctx = await scenario();
    const visit = await bookVisit(ctx, { expectedDurationMinutes: 45 });
    expect(
      (await post(ctx.token, `${visit.id}/close`, { reason: VisitCloseReason.ClientAbsent })).status,
    ).toBe(200);

    const res = await post(ctx.token, `${visit.id}/reschedule`, {
      scheduledStart: minutesAfterStart(1440),
    });
    expect(res.status).toBe(201);
    const successor = await json<Visit>(res);

    expect(successor.expectedDurationMinutes).toBe(45);
    expect(successor.scheduledEnd).toBe(minutesAfterStart(1485));
    expect(successor.rescheduledFromId).toBe(visit.id);
    expect(successor.internalCode).not.toBe(visit.internalCode);
    // A visit nobody has made yet has no actuals, whatever the closed one had.
    expect(successor.actualStart).toBeUndefined();
    expect(successor.status).toBe(VisitStatus.Scheduled);
  });

  test('refuses to reschedule onto an order that is no longer open', async () => {
    const ctx = await scenario();
    const visit = await bookVisit(ctx);
    expect(
      (await post(ctx.token, `${visit.id}/close`, { reason: VisitCloseReason.ClientAbsent })).status,
    ).toBe(200);

    const cancelled = await request(`/service-orders/${ctx.order.id}/status`, {
      method: 'POST',
      headers: jsonHeaders(ctx.token),
      body: JSON.stringify({ status: ServiceOrderStatus.Cancelled }),
    });
    expect(cancelled.status).toBe(200);

    // Rescheduling creates a visit, so it answers to the same rule creating one
    // does — otherwise it is a way around it, and a cancelled job grows fresh
    // work after the client was told it was off.
    const res = await post(ctx.token, `${visit.id}/reschedule`, {
      scheduledStart: minutesAfterStart(1440),
    });
    expect(res.status).toBe(409);
    expect((await json<{ error: string }>(res)).error).toBe('service_order_not_open');
  });

  test('an explicit duration overrides the inherited one', async () => {
    const ctx = await scenario();
    const visit = await bookVisit(ctx, { expectedDurationMinutes: 45 });
    expect(
      (await post(ctx.token, `${visit.id}/close`, { reason: VisitCloseReason.ClientAbsent })).status,
    ).toBe(200);

    const res = await post(ctx.token, `${visit.id}/reschedule`, {
      scheduledStart: minutesAfterStart(1440),
      expectedDurationMinutes: 120,
    });
    expect(res.status).toBe(201);
    const successor = await json<Visit>(res);
    expect(successor.expectedDurationMinutes).toBe(120);
    expect(successor.scheduledEnd).toBe(minutesAfterStart(1560));
  });
});

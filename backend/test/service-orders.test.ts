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
  uniqueServiceName,
} from './helpers/fixtures';
import { createDb } from '../src/modules/database/client';
import {
  customerInteractions,
  reports,
  serviceOrderServices,
  serviceOrders,
  services,
} from '../src/modules/database/schema';
import { ServiceTaxRate, ServiceUom } from '../src/modules/services/enums/services.enum';
import { ReportStatus } from '../src/modules/reports/enums/reports.enum';
import {
  ServiceOrderEventType,
  ServiceOrderPriority,
  ServiceOrderStatus,
} from '../src/modules/service-orders/enums/service-orders.enum';

type WorkerEnv = { DATABASE_URL: string };

const db = () => createDb((env as unknown as WorkerEnv).DATABASE_URL);

type Money = { subtotal: string; tax: string; total: string };

type OrderLine = {
  id: string;
  serviceId: string;
  serviceName: string;
  uom: ServiceUom;
  taxRate: ServiceTaxRate;
  quantity: number;
  unitPrice?: string;
  amounts?: Money;
};

type OrderReport = {
  id: string;
  folio: string;
  status: ReportStatus;
  reportType: string;
  serviceId: string | null;
  assignedTo: string;
  assignedToName?: string;
};

type Order = {
  id: string;
  folio: string;
  customerId: string;
  customerName: string;
  location?: string;
  priority: ServiceOrderPriority;
  promisedDate?: string;
  status: ServiceOrderStatus;
  comments?: string;
  servicesCount: number;
  reportsTotal: number;
  reportsFinished: number;
  amounts?: Money;
  createdBy: string;
  createdByName?: string;
  lines: OrderLine[];
};

type TimelineEvent = {
  id: string;
  type: ServiceOrderEventType;
  actorId?: string;
  actorName?: string;
  ref?: { kind: string; id: string };
  changes?: Record<string, { from: unknown; to: unknown }>;
  note?: string;
};

// Orders and their children are reachable from the `test+`-named catalog
// services the suite creates, so cleanup soft-deletes both ends: the orders
// themselves and the services they were built from. Per the no-hard-delete rule
// the rows stay — they simply leave every read path via `isNull(deletedAt)`.
// `service_order_events` and `customer_interactions` are append-only and are
// deliberately left untouched.
afterAll(async () => {
  const conn = db();
  const fixtureServices = await conn
    .select({ id: services.id })
    .from(services)
    .where(like(services.name, 'test+%'));
  const serviceIds = fixtureServices.map((s) => s.id);

  if (serviceIds.length > 0) {
    const lines = await conn
      .select({ orderId: serviceOrderServices.serviceOrderId })
      .from(serviceOrderServices)
      .where(inArray(serviceOrderServices.serviceId, serviceIds));
    const orderIds = [...new Set(lines.map((l) => l.orderId))];

    if (orderIds.length > 0) {
      await conn
        .update(reports)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(inArray(reports.serviceOrderId, orderIds), isNull(reports.deletedAt)));
      await conn
        .update(serviceOrders)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(inArray(serviceOrders.id, orderIds), isNull(serviceOrders.deletedAt)));
    }
  }

  await conn
    .update(services)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(like(services.name, 'test+%'), isNull(services.deletedAt)));
});

const seedService = async (
  token: string,
  over: { price?: number; taxRate?: ServiceTaxRate; uom?: ServiceUom } = {},
) => {
  const res = await request('/services', {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({
      name: uniqueServiceName('order-svc'),
      price: over.price ?? 1000,
      uom: over.uom ?? ServiceUom.Servicio,
      taxRate: over.taxRate ?? ServiceTaxRate.Iva16,
    }),
  });
  expect(res.status).toBe(201);
  return json<{ id: string; name: string; price: string; uom: ServiceUom }>(res);
};

const createOrder = (token: string, body: object) =>
  request('/service-orders', {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(body),
  });

const setStatus = (token: string, id: string, body: object) =>
  request(`/service-orders/${id}/status`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(body),
  });

const patchOrder = (token: string, id: string, body: object) =>
  request(`/service-orders/${id}`, {
    method: 'PATCH',
    headers: jsonHeaders(token),
    body: JSON.stringify(body),
  });

const getOrder = async (token: string, id: string) => {
  const res = await request(`/service-orders/${id}`, { headers: jsonHeaders(token) });
  expect(res.status).toBe(200);
  return (await json<{ order: Order }>(res)).order;
};

const getReports = async (token: string, id: string) => {
  const res = await request(`/service-orders/${id}/reports`, { headers: jsonHeaders(token) });
  expect(res.status).toBe(200);
  return (await json<{ reports: OrderReport[] }>(res)).reports;
};

/** The whole timeline in one page — big enough for every scenario here. */
const getTimeline = async (token: string, id: string) => {
  const res = await request(`/service-orders/${id}/timeline?limit=50`, {
    headers: jsonHeaders(token),
  });
  expect(res.status).toBe(200);
  return (await json<{ items: TimelineEvent[]; total: number }>(res)).items;
};

/** An admin, a customer, a technician and one catalog service — the minimum to
 *  post an order. */
const scenario = async (serviceOver: { price?: number; taxRate?: ServiceTaxRate } = {}) => {
  const { admin, token } = await seedAdminAndLogin();
  const customer = await seedCustomer();
  const tech = await seedTechnician();
  const service = await seedService(token, serviceOver);
  return { admin, token, customer, tech, service };
};

const lineFor = (
  service: { id: string },
  tech: { id: string },
  over: { quantity?: number; reportType?: string } = {},
) => ({
  serviceId: service.id,
  quantity: over.quantity ?? 1,
  technicianId: tech.id,
  reportType: over.reportType ?? 'minisplit',
});

describe('POST /service-orders', () => {
  test('creates an order, freezes the line snapshot and explodes one report per unit', async () => {
    const { admin, token, customer, tech, service } = await scenario({ price: 1500 });

    const res = await createOrder(token, {
      customerId: customer.id,
      location: 'Planta norte',
      lines: [lineFor(service, tech, { quantity: 3 })],
    });
    expect(res.status).toBe(201);
    const { order } = await json<{ order: Order }>(res);

    expect(order.folio).toMatch(/^OS-\d{8}-\d{4}$/);
    expect(order.status).toBe(ServiceOrderStatus.Open);
    expect(order.customerName).toBe(customer.name);
    expect(order.createdBy).toBe(admin.id);
    expect(order.servicesCount).toBe(1);

    // Snapshot, not a live catalog read.
    expect(order.lines).toHaveLength(1);
    expect(order.lines[0]!.serviceName).toBe(service.name);
    expect(order.lines[0]!.unitPrice).toBe('1500.00');
    expect(order.lines[0]!.quantity).toBe(3);

    // One report per sold unit, each born complete and `pending`. The detail
    // response carries no reports — the order view lazy-loads them here.
    const exploded = await getReports(token, order.id);
    expect(exploded).toHaveLength(3);
    for (const report of exploded) {
      expect(report.status).toBe(ReportStatus.Pending);
      expect(report.assignedTo).toBe(tech.id);
      expect(report.serviceId).toBe(service.id);
      expect(report.folio).toMatch(/^R-\d{8}-\d{4}$/);
    }
    // Distinct folios — the counter reserved a range, it didn't reuse one.
    expect(new Set(exploded.map((r) => r.folio)).size).toBe(3);
  });

  test('defaults the dispatch fields and round-trips them when sent (CP-2b)', async () => {
    const { token, customer, tech, service } = await scenario();

    // Omitted → normal queue, no promise made.
    const plain = await createOrder(token, {
      customerId: customer.id,
      lines: [lineFor(service, tech)],
    });
    expect(plain.status).toBe(201);
    const { order: defaulted } = await json<{ order: Order }>(plain);
    expect(defaulted.priority).toBe(ServiceOrderPriority.Normal);
    expect(defaulted.promisedDate).toBeUndefined();

    const second = await seedService(token);
    const withFlags = await createOrder(token, {
      customerId: customer.id,
      priority: ServiceOrderPriority.Urgent,
      promisedDate: '2026-12-01',
      lines: [lineFor(second, tech)],
    });
    expect(withFlags.status).toBe(201);
    const { order } = await json<{ order: Order }>(withFlags);
    expect(order.priority).toBe(ServiceOrderPriority.Urgent);
    // Date-only string, byte-identical on the way back — no timezone drift.
    expect(order.promisedDate).toBe('2026-12-01');
    expect((await getOrder(token, order.id)).promisedDate).toBe('2026-12-01');
  });

  test('rejects two lines for the same service with 400', async () => {
    const { token, customer, tech, service } = await scenario();
    const res = await createOrder(token, {
      customerId: customer.id,
      lines: [lineFor(service, tech), lineFor(service, tech, { quantity: 2 })],
    });
    // The unique index would refuse this anyway — the refine turns it into a
    // clean validation error instead of a unique-violation 500.
    expect(res.status).toBe(400);
  });

  test('caps the total exploded units per order', async () => {
    const { token, customer, tech } = await scenario();
    const a = await seedService(token);
    const b = await seedService(token);
    const c = await seedService(token);
    const res = await createOrder(token, {
      customerId: customer.id,
      // 3 × 20 = 60 units > the 50-report explosion cap.
      lines: [a, b, c].map((svc) => lineFor(svc, tech, { quantity: 20 })),
    });
    expect(res.status).toBe(400);
  });

  test('sums per-line tax exactly (16% + exento)', async () => {
    const { token, customer, tech } = await scenario();
    const taxed = await seedService(token, { price: 1000, taxRate: ServiceTaxRate.Iva16 });
    const exempt = await seedService(token, { price: 500, taxRate: ServiceTaxRate.Exento });

    const res = await createOrder(token, {
      customerId: customer.id,
      lines: [lineFor(taxed, tech, { quantity: 2 }), lineFor(exempt, tech)],
    });
    const { order } = await json<{ order: Order }>(res);

    // 2 × 1000 = 2000 (+16% = 320), 1 × 500 = 500 (exento, +0).
    expect(order.amounts).toEqual({ subtotal: '2500.00', tax: '320.00', total: '2820.00' });
    expect(order.servicesCount).toBe(2);
  });

  test('opens the order timeline and announces on the customer CRM timeline', async () => {
    const { token, customer, tech, service } = await scenario();
    const res = await createOrder(token, {
      customerId: customer.id,
      lines: [lineFor(service, tech, { quantity: 2 })],
    });
    const { order } = await json<{ order: Order }>(res);

    // Events from one transaction share Postgres' transaction timestamp, so
    // assert composition, not position, for the creation burst.
    const events = await getTimeline(token, order.id);
    const types = events.map((e) => e.type);
    expect(types).toContain(ServiceOrderEventType.OrderCreated);
    expect(types.filter((t) => t === ServiceOrderEventType.OrderLineAdded)).toHaveLength(1);
    expect(types.filter((t) => t === ServiceOrderEventType.ReportExploded)).toHaveLength(2);
    const created = events.find((e) => e.type === ServiceOrderEventType.OrderCreated);
    expect(created!.actorName).toBeTruthy();

    // The customer's own timeline gets a complementary system entry (08).
    const entries = await db()
      .select()
      .from(customerInteractions)
      .where(eq(customerInteractions.customerId, customer.id));
    const systemEntry = entries.find((e) => e.refId === order.id);
    expect(systemEntry).toBeDefined();
    expect(systemEntry!.body).toContain(order.folio);
    expect(systemEntry!.refKind).toBe('service_order');
  });

  test('rejects a soft-deleted service with 422 invalid_reference', async () => {
    const { token, customer, tech, service } = await scenario();
    const del = await request(`/services/${service.id}`, {
      method: 'DELETE',
      headers: jsonHeaders(token),
      body: JSON.stringify({ deleteComment: 'retirado' }),
    });
    expect(del.status).toBe(200);

    const res = await createOrder(token, {
      customerId: customer.id,
      lines: [lineFor(service, tech)],
    });
    expect(res.status).toBe(422);
    expect((await json<{ error: string }>(res)).error).toBe('invalid_reference');
  });

  test('rejects an unknown technician with 422 invalid_reference', async () => {
    const { token, customer, service } = await scenario();
    const res = await createOrder(token, {
      customerId: customer.id,
      lines: [lineFor(service, { id: '00000000-0000-4000-8000-000000000000' })],
    });
    expect(res.status).toBe(422);
  });

  test('rolls the whole transaction back when one line is invalid', async () => {
    const { token, customer, tech, service } = await scenario();
    const before = await db()
      .select({ id: serviceOrders.id })
      .from(serviceOrders)
      .where(eq(serviceOrders.customerId, customer.id));

    const res = await createOrder(token, {
      customerId: customer.id,
      lines: [
        lineFor(service, tech),
        lineFor({ id: '00000000-0000-4000-8000-000000000000' }, tech),
      ],
    });
    expect(res.status).toBe(422);

    // No half-written order, and no orphaned exploded reports.
    const after = await db()
      .select({ id: serviceOrders.id })
      .from(serviceOrders)
      .where(eq(serviceOrders.customerId, customer.id));
    expect(after).toHaveLength(before.length);
  });

  test('requires at least one line', async () => {
    const { token, customer } = await scenario();
    const res = await createOrder(token, { customerId: customer.id, lines: [] });
    expect(res.status).toBe(400);
  });

  test('technicians cannot create orders', async () => {
    const { customer, tech, service } = await scenario();
    const { token } = await seedTechnicianAndLogin();
    const res = await createOrder(token, {
      customerId: customer.id,
      lines: [lineFor(service, tech)],
    });
    expect(res.status).toBe(403);
  });
});

describe('GET /service-orders', () => {
  test('pages and filters by customer', async () => {
    const { token, customer, tech, service } = await scenario();
    await createOrder(token, { customerId: customer.id, lines: [lineFor(service, tech)] });

    const res = await request(`/service-orders?customerId=${customer.id}&page=1&limit=10`, {
      headers: jsonHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await json<{ items: Order[]; total: number; page: number }>(res);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.items[0]!.customerId).toBe(customer.id);
    expect(body.items[0]!.servicesCount).toBe(1);
  });

  test('filters by priority and by overdue (CP-2b)', async () => {
    const { token, customer, tech, service } = await scenario();
    const second = await seedService(token);
    const third = await seedService(token);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const urgent = await json<{ order: Order }>(
      await createOrder(token, {
        customerId: customer.id,
        priority: ServiceOrderPriority.Urgent,
        lines: [lineFor(service, tech)],
      }),
    );
    const broken = await json<{ order: Order }>(
      await createOrder(token, {
        customerId: customer.id,
        promisedDate: yesterday,
        lines: [lineFor(second, tech)],
      }),
    );
    // A broken promise on a COMPLETED order is not overdue — the filter is
    // about work still owed, so it must drop out below.
    const done = await json<{ order: Order }>(
      await createOrder(token, {
        customerId: customer.id,
        promisedDate: yesterday,
        lines: [lineFor(third, tech)],
      }),
    );
    await setStatus(token, done.order.id, { status: ServiceOrderStatus.Completed });

    const listIds = async (params: string) => {
      const res = await request(`/service-orders?customerId=${customer.id}&${params}`, {
        headers: jsonHeaders(token),
      });
      expect(res.status).toBe(200);
      return (await json<{ items: Order[] }>(res)).items.map((o) => o.id);
    };

    const urgentIds = await listIds(`priority=${ServiceOrderPriority.Urgent}`);
    expect(urgentIds).toEqual([urgent.order.id]);

    const overdueIds = await listIds('overdue=true');
    expect(overdueIds).toEqual([broken.order.id]);
  });

  test('counts report progress per order, excluding cancelled reports (CP-2b)', async () => {
    const { token, customer, tech, service } = await scenario();
    const created = await createOrder(token, {
      customerId: customer.id,
      lines: [lineFor(service, tech, { quantity: 3 })],
    });
    const { order } = await json<{ order: Order }>(created);
    expect(order.reportsTotal).toBe(3);
    expect(order.reportsFinished).toBe(0);

    // Finish one of the three exploded reports directly — the sign-off flow
    // needs a signature upload this suite has no business faking.
    const exploded = await getReports(token, order.id);
    await db()
      .update(reports)
      .set({ status: ReportStatus.Finished, finishedAt: new Date() })
      .where(eq(reports.id, exploded[0]!.id));

    const detail = await getOrder(token, order.id);
    expect(detail.reportsTotal).toBe(3);
    expect(detail.reportsFinished).toBe(1);

    // The list carries the same counts (one grouped query per page).
    const listed = await request(`/service-orders?customerId=${customer.id}`, {
      headers: jsonHeaders(token),
    });
    const { items } = await json<{ items: Order[] }>(listed);
    expect(items.find((o) => o.id === order.id)!.reportsFinished).toBe(1);

    // Cancelling voids the two unfinished reports, and voided rows leave BOTH
    // counts — the denominator is real work, so progress reads 1/1, not 1/3.
    await setStatus(token, order.id, { status: ServiceOrderStatus.Cancelled });
    const after = await getOrder(token, order.id);
    expect(after.reportsTotal).toBe(1);
    expect(after.reportsFinished).toBe(1);
  });

  test('hides every money field from technicians', async () => {
    const { token, customer, tech, service } = await scenario();
    const created = await createOrder(token, {
      customerId: customer.id,
      lines: [lineFor(service, tech)],
    });
    const { order } = await json<{ order: Order }>(created);

    const { token: techToken } = await seedTechnicianAndLogin();
    const seen = await getOrder(techToken, order.id);

    expect(seen.amounts).toBeUndefined();
    expect(seen.lines[0]!.unitPrice).toBeUndefined();
    expect(seen.lines[0]!.amounts).toBeUndefined();
    // Everything else the field needs is still there.
    expect(seen.lines[0]!.serviceName).toBe(service.name);
    expect(seen.lines[0]!.quantity).toBe(1);
  });

  test('404s an unknown order', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/service-orders/00000000-0000-4000-8000-000000000000', {
      headers: jsonHeaders(token),
    });
    expect(res.status).toBe(404);
  });

  test('404s a malformed id on every :id route — never a 500', async () => {
    const { token } = await seedAdminAndLogin();
    const detail = await request('/service-orders/not-a-uuid', { headers: jsonHeaders(token) });
    expect(detail.status).toBe(404);
    const timeline = await request('/service-orders/not-a-uuid/timeline', {
      headers: jsonHeaders(token),
    });
    expect(timeline.status).toBe(404);
    const status = await setStatus(token, 'not-a-uuid', {
      status: ServiceOrderStatus.Completed,
    });
    expect(status.status).toBe(404);
  });
});

describe('GET /service-orders/:id/timeline', () => {
  test('pages newest-first with a stable total', async () => {
    const { token, customer, tech, service } = await scenario();
    const created = await createOrder(token, {
      customerId: customer.id,
      lines: [lineFor(service, tech, { quantity: 2 })],
    });
    const { order } = await json<{ order: Order }>(created);
    // 4 creation events + 1 completion (written later, so strictly newest).
    await setStatus(token, order.id, { status: ServiceOrderStatus.Completed });

    const page = async (n: number) => {
      const res = await request(`/service-orders/${order.id}/timeline?page=${n}&limit=2`, {
        headers: jsonHeaders(token),
      });
      expect(res.status).toBe(200);
      return json<{ items: TimelineEvent[]; total: number; page: number; limit: number }>(res);
    };

    const first = await page(1);
    expect(first.total).toBe(5);
    expect(first.items).toHaveLength(2);
    // Newest-first: the completion outranks the whole creation burst.
    expect(first.items[0]!.type).toBe(ServiceOrderEventType.OrderCompleted);

    // Stable ordering across pages: 2+2+1, no duplicates, nothing dropped.
    const second = await page(2);
    const third = await page(3);
    expect(second.items).toHaveLength(2);
    expect(third.items).toHaveLength(1);
    const ids = [...first.items, ...second.items, ...third.items].map((e) => e.id);
    expect(new Set(ids).size).toBe(5);
  });
});

describe('PATCH /service-orders/:id', () => {
  test('office may edit comments but not location', async () => {
    const { token, customer, tech, service } = await scenario();
    const created = await createOrder(token, {
      customerId: customer.id,
      lines: [lineFor(service, tech)],
    });
    const { order } = await json<{ order: Order }>(created);

    const { token: officeToken } = await seedOfficeAndLogin();

    const ok = await patchOrder(officeToken, order.id, { comments: 'cliente pidió temprano' });
    expect(ok.status).toBe(200);
    expect((await json<{ order: Order }>(ok)).order.comments).toBe('cliente pidió temprano');

    const denied = await patchOrder(officeToken, order.id, { location: 'Otra planta' });
    expect(denied.status).toBe(403);
    expect((await json<{ error: string }>(denied)).error).toBe('forbidden_location_edit');
  });

  test('owner may edit location, and both edits land on the timeline', async () => {
    const { token, customer, tech, service } = await scenario();
    const created = await createOrder(token, {
      customerId: customer.id,
      location: 'Planta A',
      lines: [lineFor(service, tech)],
    });
    const { order } = await json<{ order: Order }>(created);

    const { token: ownerToken } = await seedOwnerAndLogin();
    const res = await patchOrder(ownerToken, order.id, { location: 'Planta B' });
    expect(res.status).toBe(200);

    const events = await getTimeline(token, order.id);
    const moved = events.find((e) => e.type === ServiceOrderEventType.OrderLocationChanged);
    expect(moved).toBeDefined();
    expect(moved!.changes!.location).toEqual({ from: 'Planta A', to: 'Planta B' });
  });

  test('office may edit priority and promise date, and both land on the timeline (CP-2b)', async () => {
    const { token, customer, tech, service } = await scenario();
    const created = await createOrder(token, {
      customerId: customer.id,
      lines: [lineFor(service, tech)],
    });
    const { order } = await json<{ order: Order }>(created);

    // Any-staff fields — office is the dispatch desk (19 §3).
    const { token: officeToken } = await seedOfficeAndLogin();
    const res = await patchOrder(officeToken, order.id, {
      priority: ServiceOrderPriority.Urgent,
      promisedDate: '2026-12-15',
    });
    expect(res.status).toBe(200);
    const { order: updated } = await json<{ order: Order }>(res);
    expect(updated.priority).toBe(ServiceOrderPriority.Urgent);
    expect(updated.promisedDate).toBe('2026-12-15');

    const events = await getTimeline(token, order.id);
    const escalated = events.find((e) => e.type === ServiceOrderEventType.OrderPriorityChanged);
    expect(escalated!.changes!.priority).toEqual({ from: 'normal', to: 'urgent' });
    const promised = events.find((e) => e.type === ServiceOrderEventType.OrderPromiseChanged);
    expect(promised!.changes!.promisedDate).toEqual({ from: null, to: '2026-12-15' });

    // null withdraws the promise.
    const cleared = await patchOrder(officeToken, order.id, { promisedDate: null });
    expect(cleared.status).toBe(200);
    expect((await json<{ order: Order }>(cleared)).order.promisedDate).toBeUndefined();
  });

  test('rejects an attempt to patch an immutable field', async () => {
    const { token, customer, tech, service } = await scenario();
    const created = await createOrder(token, {
      customerId: customer.id,
      lines: [lineFor(service, tech)],
    });
    const { order } = await json<{ order: Order }>(created);

    const res = await patchOrder(token, order.id, { customerId: customer.id });
    expect(res.status).toBe(400);
  });

  test('409s an edit on a closed order — the mutable pair freezes at complete', async () => {
    const { token, customer, tech, service } = await scenario();
    const created = await createOrder(token, {
      customerId: customer.id,
      lines: [lineFor(service, tech)],
    });
    const { order } = await json<{ order: Order }>(created);

    await setStatus(token, order.id, { status: ServiceOrderStatus.Completed });

    // Decided 2026-07-29: comments/location are editable only while open — a
    // closed order is history and the handoff has already composed from it.
    const denied = await patchOrder(token, order.id, { comments: 'tarde' });
    expect(denied.status).toBe(409);
    expect((await json<{ error: string }>(denied)).error).toBe('order_closed');
  });
});

describe('POST /service-orders/:id/status', () => {
  test('completes an order and records it on the timeline', async () => {
    const { token, customer, tech, service } = await scenario();
    const created = await createOrder(token, {
      customerId: customer.id,
      lines: [lineFor(service, tech)],
    });
    const { order } = await json<{ order: Order }>(created);

    const res = await setStatus(token, order.id, { status: ServiceOrderStatus.Completed });
    expect(res.status).toBe(200);
    expect((await json<{ order: Order }>(res)).order.status).toBe(ServiceOrderStatus.Completed);

    const events = await getTimeline(token, order.id);
    const completed = events.find((e) => e.type === ServiceOrderEventType.OrderCompleted);
    expect(completed).toBeDefined();
    expect(completed!.changes!.status).toEqual({ from: 'open', to: 'completed' });
  });

  test('cancelling voids unfinished reports and leaves finished ones alone', async () => {
    const { token, customer, tech, service } = await scenario();
    const created = await createOrder(token, {
      customerId: customer.id,
      lines: [lineFor(service, tech, { quantity: 2 })],
    });
    const { order } = await json<{ order: Order }>(created);

    // Push one of the two exploded reports to `finished` directly — the field
    // sign-off flow needs a signature upload this suite has no business faking.
    const exploded = await getReports(token, order.id);
    const survivor = exploded[0]!.id;
    await db()
      .update(reports)
      .set({ status: ReportStatus.Finished, finishedAt: new Date() })
      .where(eq(reports.id, survivor));

    const res = await setStatus(token, order.id, {
      status: ServiceOrderStatus.Cancelled,
      note: 'cliente canceló',
    });
    expect(res.status).toBe(200);

    const after = await getOrder(token, order.id);
    expect(after.status).toBe(ServiceOrderStatus.Cancelled);

    const afterReports = await getReports(token, order.id);
    const byId = new Map(afterReports.map((r) => [r.id, r.status]));
    expect(byId.get(survivor)).toBe(ReportStatus.Finished);
    const voided = afterReports.filter((r) => r.status === ReportStatus.Cancelled);
    expect(voided).toHaveLength(1);

    // The cancellation and each voided report are both on the trail.
    const events = await getTimeline(token, order.id);
    const cancelled = events.find((e) => e.type === ServiceOrderEventType.OrderCancelled);
    expect(cancelled!.note).toBe('cliente canceló');
    const statusChanges = events.filter(
      (e) => e.type === ServiceOrderEventType.ReportStatusChanged,
    );
    expect(statusChanges).toHaveLength(1);
    expect(statusChanges[0]!.changes!.status).toEqual({ from: 'pending', to: 'cancelled' });
  });

  test('409s a second transition on a closed order', async () => {
    const { token, customer, tech, service } = await scenario();
    const created = await createOrder(token, {
      customerId: customer.id,
      lines: [lineFor(service, tech)],
    });
    const { order } = await json<{ order: Order }>(created);

    expect((await setStatus(token, order.id, { status: ServiceOrderStatus.Completed })).status).toBe(
      200,
    );
    const second = await setStatus(token, order.id, { status: ServiceOrderStatus.Cancelled });
    expect(second.status).toBe(409);
    expect((await json<{ error: string }>(second)).error).toBe('invalid_status_transition');
  });

  test('reopen matrix (CP-2b): admin reopens a completed order, office 403s, terminal states 409', async () => {
    const { token, customer, tech, service } = await scenario();
    const created = await createOrder(token, {
      customerId: customer.id,
      lines: [lineFor(service, tech)],
    });
    const { order } = await json<{ order: Order }>(created);

    // Reopening an OPEN order is a 409, not a validation error — the target is
    // legal now, the state refuses it.
    const early = await setStatus(token, order.id, { status: ServiceOrderStatus.Open });
    expect(early.status).toBe(409);

    await setStatus(token, order.id, { status: ServiceOrderStatus.Completed });

    // Office may complete/cancel but not reopen — the safety valve is
    // owner/admin only (19 §3).
    const { token: officeToken } = await seedOfficeAndLogin();
    const denied = await setStatus(officeToken, order.id, { status: ServiceOrderStatus.Open });
    expect(denied.status).toBe(403);
    expect((await json<{ error: string }>(denied)).error).toBe('forbidden_reopen');

    const reopened = await setStatus(token, order.id, {
      status: ServiceOrderStatus.Open,
      note: 'se completó por error',
    });
    expect(reopened.status).toBe(200);
    expect((await json<{ order: Order }>(reopened)).order.status).toBe(ServiceOrderStatus.Open);

    // The reserved event, with the diff and the motivo.
    const events = await getTimeline(token, order.id);
    const moved = events.find((e) => e.type === ServiceOrderEventType.OrderStatusChanged);
    expect(moved!.changes!.status).toEqual({ from: 'completed', to: 'open' });
    expect(moved!.note).toBe('se completó por error');

    // A reopened order is open again for real: the frozen fields thaw.
    const patched = await patchOrder(token, order.id, { comments: 'reabierta' });
    expect(patched.status).toBe(200);

    // Cancelled stays terminal — its cascade voided children and un-voiding
    // cannot be done honestly.
    await setStatus(token, order.id, { status: ServiceOrderStatus.Cancelled });
    const undead = await setStatus(token, order.id, { status: ServiceOrderStatus.Open });
    expect(undead.status).toBe(409);
    expect((await json<{ error: string }>(undead)).error).toBe('invalid_status_transition');
  });
});

describe('exploded reports keep the report lifecycle', () => {
  test('a pending report promotes straight to in-progress on the first content write', async () => {
    const { token, customer, tech, service } = await scenario();
    const created = await createOrder(token, {
      customerId: customer.id,
      lines: [lineFor(service, tech)],
    });
    const { order } = await json<{ order: Order }>(created);
    const folio = (await getReports(token, order.id))[0]!.id;

    const techLogin = await request('/auth/login', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ email: tech.email, password: tech.password }),
    });
    const { token: techToken } = await json<{ token: string }>(techLogin);

    const res = await request(`/reports/${folio}`, {
      method: 'PATCH',
      headers: jsonHeaders(techToken),
      body: JSON.stringify({ work_type: 'Preventivo' }),
    });
    expect(res.status).toBe(200);

    const [row] = await db().select().from(reports).where(eq(reports.id, folio)).limit(1);
    expect(row!.status).toBe(ReportStatus.InProgress);
    expect(row!.serviceOrderId).toBe(order.id);
  });

  test('a report voided by cancellation rejects edits with 409', async () => {
    const { token, customer, tech, service } = await scenario();
    const created = await createOrder(token, {
      customerId: customer.id,
      lines: [lineFor(service, tech)],
    });
    const { order } = await json<{ order: Order }>(created);
    const folio = (await getReports(token, order.id))[0]!.id;

    await setStatus(token, order.id, { status: ServiceOrderStatus.Cancelled });

    // `cancelled` is outside `isEditableStatus` — a voided report must not
    // accept content afterwards, same as a finished one.
    const res = await request(`/reports/${folio}`, {
      method: 'PATCH',
      headers: jsonHeaders(token),
      body: JSON.stringify({ work_type: 'Preventivo' }),
    });
    expect(res.status).toBe(409);
  });
});

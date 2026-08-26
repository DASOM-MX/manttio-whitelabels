import { describe, expect, test } from 'vitest';
import { authHeader, env, json, jsonHeaders, request } from './helpers/request';
import {
  seedAdminAndLogin,
  seedCustomer,
  seedTechnicianAndLogin,
  uniqueName,
  uniqueRecipientEmail,
} from './helpers/fixtures';
import { eq } from 'drizzle-orm';
import { createDb } from '../src/modules/database/client';
import { ReportStatus } from '../src/modules/reports/enums/reports.enum';
import { customers, reportCounters, reports } from '../src/modules/database/schema';

type WorkerEnv = { DATABASE_URL: string };

type CustomerRow = {
  id: string;
  name: string;
  identification: string | null;
  phone: string | null;
  email: string | null;
  observation: string | null;
  status: string;
  source: string | null;
  clientType: string | null;
  statusChangedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const headersWith = (token: string) => ({ ...jsonHeaders(token) });

type Paged<T> = { items: T[]; total: number; page: number; limit: number };

/** Direct-to-DB edit for filter fixtures: the columns these tests filter on
 *  (`status`, `source`, `tags`) either move through the audited status endpoint
 *  or are not writable at all from `seedCustomer`, and the point here is the
 *  read path, not how a row got its value. */
const setCustomerFields = async (
  id: string,
  fields: Partial<{ status: string; source: string; tags: string[]; deletedAt: Date }>,
): Promise<void> => {
  const db = createDb((env as WorkerEnv).DATABASE_URL);
  await db
    .update(customers)
    .set(fields as never)
    .where(eq(customers.id, id));
};

describe('GET /customers', () => {
  test('admin gets a paged envelope including the seeded customer', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const res = await request(`/customers?limit=100&search=${encodeURIComponent(customer.name)}`, {
      headers: authHeader(token),
    });
    expect(res.status).toBe(200);
    const body = await json<Paged<CustomerRow>>(res);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.some((c) => c.id === customer.id)).toBe(true);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(100);
  });

  test('technician can also list customers (read is open to any authed user)', async () => {
    const { token } = await seedTechnicianAndLogin();
    const customer = await seedCustomer();
    const res = await request(`/customers?search=${encodeURIComponent(customer.name)}`, {
      headers: authHeader(token),
    });
    expect(res.status).toBe(200);
    const body = await json<Paged<CustomerRow>>(res);
    expect(body.items.some((c) => c.id === customer.id)).toBe(true);
  });

  // The regression this whole plan exists for (21 §1): the route used to ignore
  // every query param, so page 2 re-served page 1 and the client faked `total`
  // from the row count.
  test('page 1 and page 2 are disjoint, and total is the filtered count', async () => {
    const { token } = await seedAdminAndLogin();
    await seedCustomer();
    await seedCustomer();
    await seedCustomer();

    const first = await json<Paged<CustomerRow>>(
      await request('/customers?page=1&limit=2', { headers: authHeader(token) }),
    );
    const second = await json<Paged<CustomerRow>>(
      await request('/customers?page=2&limit=2', { headers: authHeader(token) }),
    );

    expect(first.items).toHaveLength(2);
    expect(second.items.length).toBeGreaterThan(0);
    const overlap = first.items.filter((a) => second.items.some((b) => b.id === a.id));
    expect(overlap).toEqual([]);
    // `total` counts the whole filtered set, never the page.
    expect(first.total).toBeGreaterThan(first.items.length);
    expect(second.total).toBe(first.total);
  });

  test('limit is capped at 100', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/customers?limit=5000', { headers: authHeader(token) });
    expect(res.status).toBe(400);
  });

  test('search narrows to matching rows', async () => {
    const { token } = await seedAdminAndLogin();
    const target = await seedCustomer();
    await seedCustomer();
    const body = await json<Paged<CustomerRow>>(
      await request(`/customers?search=${encodeURIComponent(target.name)}`, {
        headers: authHeader(token),
      }),
    );
    expect(body.items.map((c) => c.id)).toEqual([target.id]);
    expect(body.total).toBe(1);
  });

  test('status and source narrow the set', async () => {
    const { token } = await seedAdminAndLogin();
    const target = await seedCustomer();
    await setCustomerFields(target.id, { status: 'lead', source: 'facebook' });

    const byStatus = await json<Paged<CustomerRow>>(
      await request(
        `/customers?status=lead&search=${encodeURIComponent(target.name)}`,
        { headers: authHeader(token) },
      ),
    );
    expect(byStatus.items.map((c) => c.id)).toEqual([target.id]);

    const bySource = await json<Paged<CustomerRow>>(
      await request(
        `/customers?source=facebook&search=${encodeURIComponent(target.name)}`,
        { headers: authHeader(token) },
      ),
    );
    expect(bySource.items.map((c) => c.id)).toEqual([target.id]);

    // A filter the row does not match excludes it.
    const miss = await json<Paged<CustomerRow>>(
      await request(
        `/customers?status=blacklisted&search=${encodeURIComponent(target.name)}`,
        { headers: authHeader(token) },
      ),
    );
    expect(miss.items).toEqual([]);
    expect(miss.total).toBe(0);
  });

  test('tags matches on overlap, not on all', async () => {
    const { token } = await seedAdminAndLogin();
    const target = await seedCustomer();
    const tag = uniqueName('tag');
    await setCustomerFields(target.id, { tags: [tag, 'otro'] });

    const hit = await json<Paged<CustomerRow>>(
      await request(`/customers?tags=${encodeURIComponent(tag)},ninguno`, {
        headers: authHeader(token),
      }),
    );
    expect(hit.items.map((c) => c.id)).toEqual([target.id]);

    const miss = await json<Paged<CustomerRow>>(
      await request('/customers?tags=etiqueta-que-no-existe', { headers: authHeader(token) }),
    );
    expect(miss.items.every((c) => c.id !== target.id)).toBe(true);
  });

  test('soft-deleted rows never appear', async () => {
    const { token } = await seedAdminAndLogin();
    const target = await seedCustomer();
    await setCustomerFields(target.id, { deletedAt: new Date() });
    const body = await json<Paged<CustomerRow>>(
      await request(`/customers?search=${encodeURIComponent(target.name)}`, {
        headers: authHeader(token),
      }),
    );
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });
});

describe('GET /customers/all', () => {
  test('returns the whole roster unpaged, ignoring page/limit', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const res = await request('/customers/all?page=2&limit=1', { headers: authHeader(token) });
    expect(res.status).toBe(200);
    const body = await json<{ id: string; name: string; timezone: string }[]>(res);
    // A bare array, not an envelope (21 §3 amendment): a roster has no page and
    // no limit, and a `total` could only ever be the array's own length.
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((c) => c.id === customer.id)).toBe(true);
  });

  test('"all" is not read as an id — it resolves to the roster route', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/customers/all', { headers: authHeader(token) });
    expect(res.status).toBe(200);
  });

  test('projection carries the fields the field app renders', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const body = await json<Record<string, unknown>[]>(
      await request('/customers/all', { headers: authHeader(token) }),
    );
    const row = body.find((c) => c.id === customer.id);
    expect(row).toBeDefined();
    // `timezone` drives every report date in the field app; `razonSocial` feeds
    // its directory search. Both were missing from the plan's projection.
    for (const key of ['id', 'name', 'razonSocial', 'identification', 'phone', 'email', 'state', 'timezone']) {
      expect(row).toHaveProperty(key);
    }
  });
});

describe('GET /customers/:id', () => {
  test('admin can fetch a customer by id', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const res = await request(`/customers/${customer.id}`, { headers: authHeader(token) });
    expect(res.status).toBe(200);
    const body = await json<{ customer: CustomerRow }>(res);
    expect(body.customer.id).toBe(customer.id);
    expect(body.customer.name).toBe(customer.name);
    expect(body.customer.email).toBe(customer.email);
  });

  test('technician can fetch a customer by id', async () => {
    const { token } = await seedTechnicianAndLogin();
    const customer = await seedCustomer();
    const res = await request(`/customers/${customer.id}`, { headers: authHeader(token) });
    expect(res.status).toBe(200);
  });

  test('unknown id → 404 not_found', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/customers/00000000-0000-0000-0000-000000000000', {
      headers: authHeader(token),
    });
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ error: 'not_found' });
  });
});

describe('POST /customers', () => {
  test('admin creates a customer with name only (201)', async () => {
    const { token } = await seedAdminAndLogin();
    const name = uniqueName('create-minimal');
    const res = await request('/customers', {
      method: 'POST',
      headers: headersWith(token),
      body: JSON.stringify({ name }),
    });
    expect(res.status).toBe(201);
    const body = await json<{ customer: CustomerRow }>(res);
    expect(body.customer.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(body.customer.name).toBe(name);
    expect(body.customer.identification).toBeNull();
    expect(body.customer.phone).toBeNull();
    expect(body.customer.email).toBeNull();
    expect(body.customer.observation).toBeNull();
  });

  test('admin creates a customer with all optional fields (201)', async () => {
    const { token } = await seedAdminAndLogin();
    const payload = {
      name: uniqueName('create-full'),
      identification: 'RFC-ABC123456',
      phone: '+52 555 123 4567',
      email: uniqueRecipientEmail('create-full'),
      observation: 'Annual maintenance contract.',
    };
    const res = await request('/customers', {
      method: 'POST',
      headers: headersWith(token),
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(201);
    const body = await json<{ customer: CustomerRow }>(res);
    expect(body.customer).toMatchObject(payload);
  });

  test('missing name → 400', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/customers', {
      method: 'POST',
      headers: headersWith(token),
      body: JSON.stringify({ phone: '555' }),
    });
    expect(res.status).toBe(400);
  });

  test('empty name → 400 (zod min(1))', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/customers', {
      method: 'POST',
      headers: headersWith(token),
      body: JSON.stringify({ name: '' }),
    });
    expect(res.status).toBe(400);
  });

  test('invalid email format → 400', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/customers', {
      method: 'POST',
      headers: headersWith(token),
      body: JSON.stringify({ name: uniqueName('bad-email'), email: 'not-an-email' }),
    });
    expect(res.status).toBe(400);
  });

  test('technician cannot create customers → 403', async () => {
    const { token } = await seedTechnicianAndLogin();
    const res = await request('/customers', {
      method: 'POST',
      headers: headersWith(token),
      body: JSON.stringify({ name: uniqueName('forbidden') }),
    });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /customers/:id', () => {
  test('admin can rename a customer', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const newName = uniqueName('renamed');
    const res = await request(`/customers/${customer.id}`, {
      method: 'PATCH',
      headers: headersWith(token),
      body: JSON.stringify({ name: newName }),
    });
    expect(res.status).toBe(200);
    const body = await json<{ customer: CustomerRow }>(res);
    expect(body.customer.name).toBe(newName);
    expect(body.customer.email).toBe(customer.email);
  });

  test('admin can set phone on a customer that did not have one', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const res = await request(`/customers/${customer.id}`, {
      method: 'PATCH',
      headers: headersWith(token),
      body: JSON.stringify({ phone: '+52 81 1234 5678' }),
    });
    expect(res.status).toBe(200);
    const body = await json<{ customer: CustomerRow }>(res);
    expect(body.customer.phone).toBe('+52 81 1234 5678');
  });

  test('admin can change email', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const newEmail = uniqueRecipientEmail('updated');
    const res = await request(`/customers/${customer.id}`, {
      method: 'PATCH',
      headers: headersWith(token),
      body: JSON.stringify({ email: newEmail }),
    });
    expect(res.status).toBe(200);
    const body = await json<{ customer: CustomerRow }>(res);
    expect(body.customer.email).toBe(newEmail);
  });

  test('unknown id → 404 not_found', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/customers/00000000-0000-0000-0000-000000000000', {
      method: 'PATCH',
      headers: headersWith(token),
      body: JSON.stringify({ name: 'nope' }),
    });
    expect(res.status).toBe(404);
  });

  test('empty body (no fields) → 400', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const res = await request(`/customers/${customer.id}`, {
      method: 'PATCH',
      headers: headersWith(token),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test('invalid email format → 400', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const res = await request(`/customers/${customer.id}`, {
      method: 'PATCH',
      headers: headersWith(token),
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    expect(res.status).toBe(400);
  });

  test('technician cannot patch → 403', async () => {
    const { token } = await seedTechnicianAndLogin();
    const customer = await seedCustomer();
    const res = await request(`/customers/${customer.id}`, {
      method: 'PATCH',
      headers: headersWith(token),
      body: JSON.stringify({ name: 'nope' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('customer status/source/clientType writes (utm-params CP-1)', () => {
  test('admin POST with status/source/clientType persists them', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/customers', {
      method: 'POST',
      headers: headersWith(token),
      body: JSON.stringify({
        name: uniqueName('crm-fields'),
        status: 'lead',
        source: 'instagram',
        clientType: 'business',
      }),
    });
    expect(res.status).toBe(201);
    const body = await json<{ customer: CustomerRow }>(res);
    expect(body.customer.status).toBe('lead');
    expect(body.customer.source).toBe('instagram');
    expect(body.customer.clientType).toBe('business');
  });

  test('PATCH status transition persists and stamps statusChangedAt', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer(); // born active, statusChangedAt NULL
    const res = await request(`/customers/${customer.id}`, {
      method: 'PATCH',
      headers: headersWith(token),
      body: JSON.stringify({ status: 'disabled' }),
    });
    expect(res.status).toBe(200);
    const body = await json<{ customer: CustomerRow }>(res);
    expect(body.customer.status).toBe('disabled');
    expect(body.customer.statusChangedAt).not.toBeNull();
  });

  test('PATCH with an invalid status value → 400', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const res = await request(`/customers/${customer.id}`, {
      method: 'PATCH',
      headers: headersWith(token),
      body: JSON.stringify({ status: 'archived' }),
    });
    expect(res.status).toBe(400);
  });

  // Locks the write-once attribution contract: zod strips the unknown key and
  // the existing "no fields to update" refine rejects the now-empty payload.
  test('PATCH with only utmSource → 400 (attribution is write-once)', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const res = await request(`/customers/${customer.id}`, {
      method: 'PATCH',
      headers: headersWith(token),
      body: JSON.stringify({ utmSource: 'x' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /customers/:id', () => {
  test('admin can soft-delete a customer; it disappears from reads but the row survives', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const res = await request(`/customers/${customer.id}`, {
      method: 'DELETE',
      headers: authHeader(token),
    });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ id: customer.id, deleted: true });

    const after = await request(`/customers/${customer.id}`, { headers: authHeader(token) });
    expect(after.status).toBe(404);

    // Soft delete: the row is tombstoned, not gone.
    const db = createDb((env as unknown as WorkerEnv).DATABASE_URL);
    const [row] = await db.select().from(customers).where(eq(customers.id, customer.id));
    expect(row?.deletedAt).not.toBeNull();
  });

  test('soft-deleting a customer with reports succeeds; reports keep their FK', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const customer = await seedCustomer();

    // Plant a report referencing this customer. Soft delete never touches the
    // reports FK, so deletion succeeds and the report keeps its clientId.
    // We use a synthetic folio in the year-2099 partition so it cannot collide with
    // anything real and is easy to truncate later.
    const db = createDb((env as unknown as WorkerEnv).DATABASE_URL);
    const day = '2099-12-31';
    await db
      .insert(reportCounters)
      .values({ day, lastNumber: 1 })
      .onConflictDoNothing({ target: reportCounters.day });
    const folio = `RPT-${day}-fk-${Math.random().toString(36).slice(2, 8)}`;
    await db.insert(reports).values({
      id: folio,
      reportType: 'minisplit',
      createdBy: admin.id,
      assignedTo: admin.id,
      clientId: customer.id,
      status: ReportStatus.Created,
    });

    const res = await request(`/customers/${customer.id}`, {
      method: 'DELETE',
      headers: authHeader(token),
    });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ id: customer.id, deleted: true });

    const [report] = await db.select().from(reports).where(eq(reports.id, folio));
    expect(report?.clientId).toBe(customer.id);
  });

  test('deleting an unknown id → 404', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/customers/00000000-0000-0000-0000-000000000000', {
      method: 'DELETE',
      headers: authHeader(token),
    });
    expect(res.status).toBe(404);
  });

  test('technician cannot delete → 403', async () => {
    const { token } = await seedTechnicianAndLogin();
    const customer = await seedCustomer();
    const res = await request(`/customers/${customer.id}`, {
      method: 'DELETE',
      headers: authHeader(token),
    });
    expect(res.status).toBe(403);
  });
});

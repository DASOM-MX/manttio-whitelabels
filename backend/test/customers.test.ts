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
import { ReportStatus } from '../src/modules/reports/enums/reports.enum';
import { reportCounters, reports } from '../src/modules/database/schema';

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

describe('GET /customers', () => {
  test('admin gets a list including the seeded customer', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const res = await request('/customers', { headers: authHeader(token) });
    expect(res.status).toBe(200);
    const body = await json<{ customers: CustomerRow[] }>(res);
    expect(Array.isArray(body.customers)).toBe(true);
    expect(body.customers.some((c) => c.id === customer.id)).toBe(true);
  });

  test('technician can also list customers (read is open to any authed user)', async () => {
    const { token } = await seedTechnicianAndLogin();
    const customer = await seedCustomer();
    const res = await request('/customers', { headers: authHeader(token) });
    expect(res.status).toBe(200);
    const body = await json<{ customers: CustomerRow[] }>(res);
    expect(body.customers.some((c) => c.id === customer.id)).toBe(true);
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
  test('admin can hard-delete a customer with no reports', async () => {
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
  });

  test('cannot delete a customer that has reports → 409 in_use', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const customer = await seedCustomer();

    // Plant a report referencing this customer so the FK restrict trips on DELETE.
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
    expect(res.status).toBe(409);
    const body = await json<{ error: string; message?: string }>(res);
    expect(body.error).toBe('in_use');
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

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
import { CustomerSource, CustomerStatus } from '../src/modules/customers/enums/customers.enum';
import { customers as customersTable, reportCounters, reports } from '../src/modules/database/schema';

type WorkerEnv = { DATABASE_URL: string };

type CustomerRow = {
  id: string;
  name: string;
  identification: string | null;
  phone: string | null;
  email: string | null;
  observation: string | null;
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
    const body = await json<{ items: CustomerRow[] }>(res);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.some((c) => c.id === customer.id)).toBe(true);
  });

  test('technician can also list customers (read is open to any authed user)', async () => {
    const { token } = await seedTechnicianAndLogin();
    const customer = await seedCustomer();
    const res = await request('/customers', { headers: authHeader(token) });
    expect(res.status).toBe(200);
    const body = await json<{ items: CustomerRow[] }>(res);
    expect(body.items.some((c) => c.id === customer.id)).toBe(true);
  });
});

describe('GET /customers/:id', () => {
  test('admin can fetch a customer by id', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const res = await request(`/customers/${customer.id}`, { headers: authHeader(token) });
    expect(res.status).toBe(200);
    const body = await json<CustomerRow>(res);
    expect(body.id).toBe(customer.id);
    expect(body.name).toBe(customer.name);
    expect(body.email).toBe(customer.email);
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
    const body = await json<CustomerRow>(res);
    expect(body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(body.name).toBe(name);
    expect(body.identification).toBeNull();
    expect(body.phone).toBeNull();
    expect(body.email).toBeNull();
    expect(body.observation).toBeNull();
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
    const body = await json<CustomerRow>(res);
    expect(body).toMatchObject(payload);
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
    const body = await json<CustomerRow>(res);
    expect(body.name).toBe(newName);
    expect(body.email).toBe(customer.email);
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
    const body = await json<CustomerRow>(res);
    expect(body.phone).toBe('+52 81 1234 5678');
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
    const body = await json<CustomerRow>(res);
    expect(body.email).toBe(newEmail);
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

describe('DELETE /customers/:id', () => {
  test('admin can soft-delete a customer with no reports', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const res = await request(`/customers/${customer.id}`, {
      method: 'DELETE',
      headers: authHeader(token),
    });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ id: customer.id, deleted: true });

    // Soft delete: the row is tombstoned, so it 404s on fetch and drops from the list.
    const after = await request(`/customers/${customer.id}`, { headers: authHeader(token) });
    expect(after.status).toBe(404);
  });

  test('admin can record an audit comment on delete', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const res = await request(`/customers/${customer.id}`, {
      method: 'DELETE',
      headers: headersWith(token),
      body: JSON.stringify({ deleteComment: 'duplicate account' }),
    });
    expect(res.status).toBe(200);

    // The comment + acting user land on the tombstoned row.
    const db = createDb((env as unknown as WorkerEnv).DATABASE_URL);
    const [row] = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.id, customer.id))
      .limit(1);
    expect(row?.deleteComment).toBe('duplicate account');
    expect(row?.deletedBy).toBe(admin.id);
    expect(row?.deletedAt).not.toBeNull();
  });

  test('soft-deleting a customer that has reports succeeds (FK untouched)', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const customer = await seedCustomer();

    // Plant a report referencing this customer. A hard delete would trip the
    // reports → customers FK restrict; a soft delete is just an UPDATE, so it
    // succeeds and the report still resolves to the (tombstoned) row.
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

type FullCustomer = {
  id: string;
  status: string;
  source: string;
  tags: string[];
  contacts: { id: string; name: string; role: string | null }[];
  fiscal: { rfc: string; legalName: string; billingEmail: string | null } | null;
};

const validFiscal = {
  rfc: 'XAXX010101000',
  legalName: 'ACME SA DE CV',
  taxRegimeCode: '601',
  fiscalZip: '64000',
  cfdiUseCode: 'G03',
  billingEmail: 'billing@example.com',
};

describe('customers — CRM fields, tags, contacts, fiscal', () => {
  test('create defaults status=active, source=other, tags=[]', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/customers', {
      method: 'POST',
      headers: headersWith(token),
      body: JSON.stringify({ name: uniqueName('defaults') }),
    });
    expect(res.status).toBe(201);
    const customer = await json<FullCustomer>(res);
    expect(customer.status).toBe(CustomerStatus.Active);
    expect(customer.source).toBe(CustomerSource.Other);
    expect(customer.tags).toEqual([]);
    expect(customer.contacts).toEqual([]);
    expect(customer.fiscal).toBeNull();
  });

  test('create with CRM fields, tags, contacts and fiscal (nested)', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/customers', {
      method: 'POST',
      headers: headersWith(token),
      body: JSON.stringify({
        name: uniqueName('full-crm'),
        status: CustomerStatus.Lead,
        source: CustomerSource.Referral,
        tags: ['vip', 'monterrey'],
        contacts: [
          { name: 'Ana Torres', role: 'Facility Manager', phone: '81-1111-2222' },
          { name: 'Beto Ruiz', email: 'beto@example.com' },
        ],
        fiscal: validFiscal,
      }),
    });
    expect(res.status).toBe(201);
    const customer = await json<FullCustomer>(res);
    expect(customer.status).toBe(CustomerStatus.Lead);
    expect(customer.source).toBe(CustomerSource.Referral);
    expect(customer.tags).toEqual(['vip', 'monterrey']);
    expect(customer.contacts).toHaveLength(2);
    expect(customer.contacts.every((c) => typeof c.id === 'string')).toBe(true);
    expect(customer.fiscal?.rfc).toBe(validFiscal.rfc);
  });

  test('rfc is uppercased and bad rfc → 400', async () => {
    const { token } = await seedAdminAndLogin();
    const ok = await request('/customers', {
      method: 'POST',
      headers: headersWith(token),
      body: JSON.stringify({
        name: uniqueName('rfc-lower'),
        fiscal: { ...validFiscal, rfc: 'xaxx010101000' },
      }),
    });
    expect(ok.status).toBe(201);
    const customer = await json<FullCustomer>(ok);
    expect(customer.fiscal?.rfc).toBe('XAXX010101000');

    const bad = await request('/customers', {
      method: 'POST',
      headers: headersWith(token),
      body: JSON.stringify({
        name: uniqueName('rfc-bad'),
        fiscal: { ...validFiscal, rfc: 'NOPE' },
      }),
    });
    expect(bad.status).toBe(400);
  });

  test('partial fiscal (missing legalName) → 400 (all-or-nothing)', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/customers', {
      method: 'POST',
      headers: headersWith(token),
      body: JSON.stringify({
        name: uniqueName('fiscal-partial'),
        fiscal: { rfc: 'XAXX010101000', taxRegimeCode: '601', fiscalZip: '64000', cfdiUseCode: 'G03' },
      }),
    });
    expect(res.status).toBe(400);
  });

  test('blacklisted status without reason → 400', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/customers', {
      method: 'POST',
      headers: headersWith(token),
      body: JSON.stringify({ name: uniqueName('bl'), status: CustomerStatus.Blacklisted }),
    });
    expect(res.status).toBe(400);
  });

  test('patch replaces contacts wholesale and clears fiscal with null', async () => {
    const { token } = await seedAdminAndLogin();
    const created = await request('/customers', {
      method: 'POST',
      headers: headersWith(token),
      body: JSON.stringify({
        name: uniqueName('replace'),
        contacts: [{ name: 'First Contact' }],
        fiscal: validFiscal,
      }),
    });
    const customer = await json<FullCustomer>(created);

    const patched = await request(`/customers/${customer.id}`, {
      method: 'PATCH',
      headers: headersWith(token),
      body: JSON.stringify({
        contacts: [{ name: 'Replacement A' }, { name: 'Replacement B' }],
        fiscal: null,
      }),
    });
    expect(patched.status).toBe(200);
    const updated = await json<FullCustomer>(patched);
    expect(updated.contacts.map((c) => c.name)).toEqual(['Replacement A', 'Replacement B']);
    expect(updated.fiscal).toBeNull();
  });

  test('list is filterable by status, source and tag; paged with total', async () => {
    const { token } = await seedAdminAndLogin();
    const tag = `t-${Math.random().toString(36).slice(2, 8)}`;
    await request('/customers', {
      method: 'POST',
      headers: headersWith(token),
      body: JSON.stringify({
        name: uniqueName('lead-fb'),
        status: CustomerStatus.Lead,
        source: CustomerSource.Facebook,
        tags: [tag],
      }),
    });

    const byTag = await request(`/customers?tags=${tag}&status=${CustomerStatus.Lead}&limit=10&page=1`, {
      headers: authHeader(token),
    });
    expect(byTag.status).toBe(200);
    const body = await json<{ items: FullCustomer[]; total: number; page: number; limit: number }>(byTag);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(10);
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.items.every((c) => c.tags.includes(tag))).toBe(true);
    expect(body.items.every((c) => c.status === CustomerStatus.Lead)).toBe(true);
  });
});

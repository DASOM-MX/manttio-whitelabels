import { describe, expect, test } from 'vitest';
import { authHeader, json, jsonHeaders, request } from './helpers/request';
import { seedAdminAndLogin, seedCustomer, seedTechnicianAndLogin } from './helpers/fixtures';

type Contact = {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
};

const headersWith = (token: string) => ({ ...jsonHeaders(token) });

const addContact = async (token: string, body: Record<string, unknown>) =>
  request('/contacts', { method: 'POST', headers: headersWith(token), body: JSON.stringify(body) });

describe('POST /contacts', () => {
  test('admin adds a contact and gets it back with a stable id (201)', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const res = await addContact(token, {
      customerId: customer.id,
      name: 'Ana Torres',
      role: 'Facility Manager',
      phone: '81-1111-2222',
    });
    expect(res.status).toBe(201);
    const contact = await json<Contact>(res);
    expect(contact.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(contact.name).toBe('Ana Torres');
    expect(contact.role).toBe('Facility Manager');
    expect(contact.email).toBeNull();

    // It shows up on the client's contacts collection.
    const list = await request(`/customers/${customer.id}/contacts`, { headers: authHeader(token) });
    const body = await json<{ items: Contact[] }>(list);
    expect(body.items.some((x) => x.id === contact.id)).toBe(true);
  });

  test('missing name → 400', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const res = await addContact(token, { customerId: customer.id, role: 'x' });
    expect(res.status).toBe(400);
  });

  test('missing customerId → 400', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await addContact(token, { name: 'Orphan' });
    expect(res.status).toBe(400);
  });

  test('unknown customer → 404 customer_not_found', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await addContact(token, {
      customerId: '00000000-0000-0000-0000-000000000000',
      name: 'X',
    });
    expect(res.status).toBe(404);
    expect((await json<{ error: string }>(res)).error).toBe('customer_not_found');
  });

  test('technician cannot add contacts → 403', async () => {
    const { token } = await seedTechnicianAndLogin();
    const customer = await seedCustomer();
    const res = await addContact(token, { customerId: customer.id, name: 'X' });
    expect(res.status).toBe(403);
  });
});

describe('GET /contacts/:id', () => {
  test('fetches a single contact by its own id', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const created = await json<Contact>(await addContact(token, { customerId: customer.id, name: 'Solo' }));
    const res = await request(`/contacts/${created.id}`, { headers: authHeader(token) });
    expect(res.status).toBe(200);
    expect((await json<Contact>(res)).id).toBe(created.id);
  });

  test('unknown id → 404', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/contacts/00000000-0000-0000-0000-000000000000', {
      headers: authHeader(token),
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /customers/:id/contacts', () => {
  test('technician can list a client contacts (read is open)', async () => {
    const admin = await seedAdminAndLogin();
    const { token: techToken } = await seedTechnicianAndLogin();
    const customer = await seedCustomer();
    await addContact(admin.token, { customerId: customer.id, name: 'Visible' });
    const res = await request(`/customers/${customer.id}/contacts`, { headers: authHeader(techToken) });
    expect(res.status).toBe(200);
    const body = await json<{ items: Contact[] }>(res);
    expect(body.items.some((x) => x.name === 'Visible')).toBe(true);
  });
});

describe('PATCH /contacts/:id', () => {
  test('admin edits a contact (id stays stable)', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const created = await json<Contact>(await addContact(token, { customerId: customer.id, name: 'Beto' }));

    const res = await request(`/contacts/${created.id}`, {
      method: 'PATCH',
      headers: headersWith(token),
      body: JSON.stringify({ role: 'Compras', phone: '55-9999' }),
    });
    expect(res.status).toBe(200);
    const updated = await json<Contact>(res);
    expect(updated.id).toBe(created.id);
    expect(updated.role).toBe('Compras');
    expect(updated.name).toBe('Beto');
  });

  test('unknown contact → 404', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/contacts/00000000-0000-0000-0000-000000000000', {
      method: 'PATCH',
      headers: headersWith(token),
      body: JSON.stringify({ role: 'x' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /contacts/:id', () => {
  test('admin removes a contact', async () => {
    const { token } = await seedAdminAndLogin();
    const customer = await seedCustomer();
    const created = await json<Contact>(await addContact(token, { customerId: customer.id, name: 'Temp' }));

    const res = await request(`/contacts/${created.id}`, { method: 'DELETE', headers: authHeader(token) });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ id: created.id, deleted: true });

    const list = await request(`/customers/${customer.id}/contacts`, { headers: authHeader(token) });
    const body = await json<{ items: Contact[] }>(list);
    expect(body.items.some((x) => x.id === created.id)).toBe(false);
  });

  test('technician cannot delete → 403', async () => {
    const admin = await seedAdminAndLogin();
    const { token: techToken } = await seedTechnicianAndLogin();
    const customer = await seedCustomer();
    const created = await json<Contact>(await addContact(admin.token, { customerId: customer.id, name: 'Temp' }));
    const res = await request(`/contacts/${created.id}`, { method: 'DELETE', headers: authHeader(techToken) });
    expect(res.status).toBe(403);
  });
});

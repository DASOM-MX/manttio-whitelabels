import { env } from 'cloudflare:test';
import { createDb } from '../../src/db/client';
import { insertCustomer } from '../../src/db/repositories/customers';
import { insertUser } from '../../src/db/repositories/users';
import { hashPassword } from '../../src/lib/password';
import { request, json, jsonHeaders } from './request';

const tag = () => Math.random().toString(36).slice(2, 10);

// Used for `users.email`. Users never receive email from this app, so a
// non-existent address cannot bounce — safe to be synthetic.
export const uniqueEmail = (scope: string) =>
  `test+${scope}-${tag()}@penanevadachillers.com`;

// Used for `customers.email`. Customers ARE recipients of report email, so even
// though tests mock Resend, we route synthetic customer addresses to a real Gmail
// inbox via `+`-aliasing as a defense-in-depth guard against accidental real sends.
export const uniqueRecipientEmail = (scope: string) =>
  `dasom.mx+test-${scope}-${tag()}@gmail.com`;

export const uniqueName = (scope: string) => `test-${scope}-${tag()}`;

type SeededUser = {
  id: string;
  email: string;
  password: string;
  role: 'admin' | 'technician';
};

const seedUser = async (role: 'admin' | 'technician'): Promise<SeededUser> => {
  const email = uniqueEmail(role);
  const password = `pw-${tag()}-${tag()}`;
  const db = createDb((env as { DATABASE_URL: string }).DATABASE_URL);
  const passwordHash = await hashPassword(password);
  const row = await insertUser(db, {
    name: `test ${role} ${tag()}`,
    email,
    passwordHash,
    role,
  });
  return { id: row.id, email, password, role };
};

export const seedAdmin = () => seedUser('admin');
export const seedTechnician = () => seedUser('technician');

type SeededCustomer = {
  id: string;
  name: string;
  email: string;
};

export const seedCustomer = async (): Promise<SeededCustomer> => {
  const name = uniqueName('customer');
  const email = uniqueRecipientEmail('customer');
  const db = createDb((env as { DATABASE_URL: string }).DATABASE_URL);
  const row = await insertCustomer(db, { name, email });
  return { id: row.id, name, email };
};

export const loginAs = async (creds: { email: string; password: string }) => {
  const res = await request('/auth/login', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(creds),
  });
  if (res.status !== 200) {
    throw new Error(`loginAs failed: ${res.status} ${await res.text()}`);
  }
  const body = await json<{ token: string }>(res);
  return body.token;
};

export const seedAdminAndLogin = async () => {
  const admin = await seedAdmin();
  const token = await loginAs(admin);
  return { admin, token };
};

export const seedTechnicianAndLogin = async () => {
  const tech = await seedTechnician();
  const token = await loginAs(tech);
  return { tech, token };
};

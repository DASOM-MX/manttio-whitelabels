import { sql } from 'drizzle-orm';
import { env } from 'cloudflare:test';
import { createDb } from '../../src/modules/database/client';
import { insertCustomer } from '../../src/modules/customers/repository/customers.repository';
import { insertUser } from '../../src/modules/users/repository/users.repository';
import { hashPassword } from '../../src/modules/auth/services/password.service';
import { reportCounters, reportDetails, reports } from '../../src/modules/database/schema';
import { ReportStatus, type WorkType } from '../../src/modules/reports/enums/reports.enum';
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

// Used for `services.name`. The catalog has no email column to isolate on, so
// service fixtures are identified by a `test+` name prefix instead — the same
// marker the user/customer fixtures use in their addresses. The suite
// soft-deletes them in `afterAll`; per the no-hard-delete rule the rows stay.
export const uniqueServiceName = (scope: string) => `test+${scope}-${tag()}`;

type SeededUser = {
  id: string;
  email: string;
  password: string;
  role: 'owner' | 'admin' | 'office' | 'technician';
};

const seedUser = async (
  role: 'owner' | 'admin' | 'office' | 'technician',
): Promise<SeededUser> => {
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
export const seedOffice = () => seedUser('office');
export const seedTechnician = () => seedUser('technician');
// Owners only exist via provisioning (the users API can't grant `owner`), so the
// fixture inserts the row directly through the repository, same as the others.
export const seedOwner = () => seedUser('owner');

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

export const seedOfficeAndLogin = async () => {
  const office = await seedOffice();
  const token = await loginAs(office);
  return { office, token };
};

export const seedOwnerAndLogin = async () => {
  const owner = await seedOwner();
  const token = await loginAs(owner);
  return { owner, token };
};

type SeedReportOpts = {
  reportType?: 'minisplit' | 'chiller' | 'uma';
  status?: ReportStatus;
  createdBy: string;
  assignedTo?: string;
  clientId: string;
  data?: Record<string, unknown>;
  workType?: WorkType | null;
};

type SeededReport = {
  id: string;
  reportType: 'minisplit' | 'chiller' | 'uma';
  status: ReportStatus;
  createdBy: string;
  assignedTo: string;
  clientId: string;
};

const defaultMinisplitData = () => ({
  is_operating: true,
  remote_working: true,
  amperage: '5.2',
  filter: true,
  inner_voltage: '220',
  unusual_noise: false,
  observations: 'seeded',
});

// Plants a report directly via Drizzle in the year-2099 folio partition so it cannot
// collide with real same-day reports. The route layer is not exercised here — use POST
// /reports for tests that need to validate the create path itself.
export const seedReport = async (opts: SeedReportOpts): Promise<SeededReport> => {
  const reportType = opts.reportType ?? 'minisplit';
  const status: ReportStatus = opts.status ?? ReportStatus.Created;
  const assignedTo = opts.assignedTo ?? opts.createdBy;
  const db = createDb((env as { DATABASE_URL: string }).DATABASE_URL);

  const day = '2099-12-31';
  const [counter] = await db
    .insert(reportCounters)
    .values({ day, lastNumber: 1 })
    .onConflictDoUpdate({
      target: reportCounters.day,
      set: { lastNumber: sql`${reportCounters.lastNumber} + 1` },
    })
    .returning({ lastNumber: reportCounters.lastNumber });
  if (!counter) throw new Error('seedReport: counter upsert returned no row');
  const seq = String(counter.lastNumber).padStart(4, '0');
  const id = `R-20991231-${seq}`;

  await db.insert(reports).values({
    id,
    reportType,
    workType: opts.workType ?? null,
    createdBy: opts.createdBy,
    assignedTo,
    clientId: opts.clientId,
    status,
  });
  await db
    .insert(reportDetails)
    .values({ reportId: id, data: opts.data ?? defaultMinisplitData() });

  return { id, reportType, status, createdBy: opts.createdBy, assignedTo, clientId: opts.clientId };
};

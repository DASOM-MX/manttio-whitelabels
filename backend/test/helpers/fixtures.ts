import { eq, sql } from 'drizzle-orm';
import { env } from 'cloudflare:test';
import { createDb } from '../../src/modules/database/client';
import { insertCustomer } from '../../src/modules/customers/repository/customers.repository';
import { insertUser } from '../../src/modules/users/repository/users.repository';
import { hashPassword } from '../../src/modules/auth/services/password.service';
import {
  customerContacts,
  reportCounters,
  reportDetails,
  reportTemplates,
  reports,
} from '../../src/modules/database/schema';
import { TemplateStatus } from '../../src/modules/report-templates/enums/report-templates.enum';
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

/** `services.internal_service_code` is unique across the live catalog, so
 *  fixtures must mint their own. The suite's soft delete releases them again
 *  (the unique index is partial on `deleted_at is null`). */
export const uniqueServiceCode = () => `TEST-${tag()}`;

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

type SeededContact = {
  id: string;
  name: string;
  email: string;
};

/** A contact on a customer — the quotation recipient picker reads these (20 §4).
 *  Inserted through the model rather than an API call because `POST /customers`
 *  owns contact creation as part of a larger payload, and quote tests only need
 *  the row. Addresses use the deliverable `+`-alias for the same
 *  defense-in-depth reason customer emails do: contacts ARE mail recipients. */
export const seedContact = async (
  customerId: string,
  opts: { isDefault?: boolean } = {},
): Promise<SeededContact> => {
  const name = uniqueName('contact');
  const email = uniqueRecipientEmail('contact');
  const db = createDb((env as { DATABASE_URL: string }).DATABASE_URL);
  const [row] = await db
    .insert(customerContacts)
    .values({ customerId, name, email, isDefault: opts.isDefault ?? false })
    .returning();
  if (!row) throw new Error('seedContact returned no row');
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
  reportType?: string;
  status?: ReportStatus;
  createdBy: string;
  assignedTo?: string;
  clientId: string;
  data?: Record<string, unknown>;
  workType?: WorkType | null;
};

type SeededReport = {
  id: string;
  reportType: string; // template name, denormalized for display
  status: ReportStatus;
  createdBy: string;
  assignedTo: string;
  clientId: string;
};

/** `reports.template_id` is a real FK (03 CP-1), so a seeded report needs a
 *  template that actually exists — a synthetic uuid gets rejected by the
 *  constraint. `report_templates` carries no `deleted_at` (lifecycle over soft
 *  delete, `disabled` is terminal) and its `name` is not unique, so the fixture
 *  is resolved by name and created once, then reused for the whole run. Like
 *  every other fixture here it is never hard-deleted. */
export const FIXTURE_TEMPLATE_NAME = 'test+fixture-report-template';

const FIXTURE_QUESTION_BOOL = '00000000-0000-0000-0000-000000000101';
const FIXTURE_QUESTION_NUM = '00000000-0000-0000-0000-000000000102';

let fixtureTemplateId: string | null = null;

export const ensureFixtureTemplate = async (): Promise<string> => {
  if (fixtureTemplateId) return fixtureTemplateId;
  const db = createDb((env as { DATABASE_URL: string }).DATABASE_URL);

  const [existing] = await db
    .select({ id: reportTemplates.id })
    .from(reportTemplates)
    .where(eq(reportTemplates.name, FIXTURE_TEMPLATE_NAME))
    .limit(1);
  if (existing) {
    fixtureTemplateId = existing.id;
    return existing.id;
  }

  const [created] = await db
    .insert(reportTemplates)
    .values({
      name: FIXTURE_TEMPLATE_NAME,
      status: TemplateStatus.Active,
      sections: [
        {
          id: '00000000-0000-0000-0000-000000000201',
          order: 0,
          title: 'General Inspection',
          columns: 1,
          questions: [
            {
              id: FIXTURE_QUESTION_BOOL,
              order: 0,
              label: 'Operating',
              datatype: 'boolean',
              required: false,
            },
            {
              id: FIXTURE_QUESTION_NUM,
              order: 1,
              label: 'Amperage',
              datatype: 'number',
              required: false,
              unit: 'A',
            },
          ],
        },
      ] as never,
    })
    .returning({ id: reportTemplates.id });
  if (!created) throw new Error('ensureFixtureTemplate: insert returned no row');
  fixtureTemplateId = created.id;
  return created.id;
};

const defaultReportCapture = (templateId: string) => ({
  templateId,
  templateName: 'Minisplit Maintenance',
  sections: [
    {
      title: 'General Inspection',
      columns: 1,
      answers: [
        {
          questionId: FIXTURE_QUESTION_BOOL,
          label: 'Operating',
          datatype: 'boolean',
          value: true,
        },
        {
          questionId: FIXTURE_QUESTION_NUM,
          label: 'Amperage',
          datatype: 'number',
          unit: 'A',
          value: 5.2,
        },
      ],
    },
  ],
});

// Plants a report directly via Drizzle in the year-2099 folio partition so it cannot
// collide with real same-day reports. The route layer is not exercised here — use POST
// /reports for tests that need to validate the create path itself.
export const seedReport = async (opts: SeedReportOpts): Promise<SeededReport> => {
  const templateId = await ensureFixtureTemplate();
  const capture = opts.data ?? defaultReportCapture(templateId);
  const templateName = typeof capture === 'object' && capture !== null && 'templateName' in capture
    ? (capture as { templateName: string }).templateName
    : 'Minisplit Maintenance';
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
    templateId,
    reportType: templateName,
    workType: opts.workType ?? null,
    createdBy: opts.createdBy,
    assignedTo,
    clientId: opts.clientId,
    status,
  });
  await db
    .insert(reportDetails)
    .values({ reportId: id, data: capture });

  return { id, reportType: templateName, status, createdBy: opts.createdBy, assignedTo, clientId: opts.clientId };
};

import { eq, sql } from 'drizzle-orm';
import { env } from 'cloudflare:test';
import { createDb } from '../../src/modules/database/client';
import { insertCustomer } from '../../src/modules/customers/repository/customers.repository';
import { insertUser } from '../../src/modules/users/repository/users.repository';
import { hashPassword } from '../../src/modules/auth/services/password.service';
import {
  contracts,
  customerContacts,
  equipment,
  equipmentReports,
  portalUserGrants,
  portalUsers,
  quotationLines,
  quotationRecipients,
  quotations,
  reportCounters,
  reportDetails,
  reportTemplates,
  reports,
  serviceOrderServices,
  serviceOrders,
} from '../../src/modules/database/schema';
import { TemplateStatus } from '../../src/modules/report-templates/enums/report-templates.enum';
import { ReportStatus, type WorkType } from '../../src/modules/reports/enums/reports.enum';
import { ContractFileType, ContractType } from '../../src/modules/contracts/enums/contracts.enum';
import {
  QuotationResponse,
  QuotationStatus,
} from '../../src/modules/quotations/enums/quotations.enum';
import { ServiceOrderStatus } from '../../src/modules/service-orders/enums/service-orders.enum';
import { ServiceTaxRate, ServiceUom } from '../../src/modules/services/enums/services.enum';
import type { PortalGrant } from '../../src/modules/portal/enums/portal-grants.enum';
import { signPortalToken } from '../../src/modules/portal/services/portal-jwt.service';
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

type SeededPortalUser = {
  id: string;
  contactId: string;
  customerId: string;
  email: string;
  password: string;
};

/** A portal user tied to a customer contact. Used for testing the portal auth
 *  surface and access control. */
export const seedPortalUser = async (opts?: {
  customerId?: string;
  contactId?: string;
}): Promise<SeededPortalUser> => {
  const db = createDb((env as { DATABASE_URL: string }).DATABASE_URL);

  // If no customer/contact provided, create them
  let customerId = opts?.customerId;
  let contactId = opts?.contactId;

  if (!customerId) {
    const customer = await seedCustomer();
    customerId = customer.id;
  }

  if (!contactId) {
    const contact = await seedContact(customerId);
    contactId = contact.id;
  }

  const email = uniqueRecipientEmail('portal-user');
  const password = `pw-${tag()}-${tag()}`;
  const passwordHash = await hashPassword(password);

  const [row] = await db
    .insert(portalUsers)
    .values({
      contactId,
      customerId,
      email,
      passwordHash,
      name: uniqueName('portal-user'),
      invitedBy: null,
    })
    .returning();

  if (!row) throw new Error('seedPortalUser returned no row');
  return {
    id: row.id,
    contactId,
    customerId,
    email,
    password,
  };
};

// ---------------------------------------------------------------------------
// Portal read fixtures (client-portal 04 CP-1). Every document series below is
// minted in the year-2099 folio partition, the `seedReport` trick, so a fixture
// can never collide with a real same-day document or burn a live counter.
// ---------------------------------------------------------------------------

const fixtureFolio = (prefix: string) => `${prefix}-20991231-${tag()}`;

/** `portal_user_grants.granted_by` is NOT NULL, so granting needs a staff row.
 *  One per run — the suite never hard-deletes, so minting one per call would
 *  litter `users` for no benefit. */
let fixtureGranterId: string | null = null;
const ensureGranter = async (): Promise<string> => {
  if (!fixtureGranterId) fixtureGranterId = (await seedAdmin()).id;
  return fixtureGranterId;
};

/** A portal user holding exactly `grants`, plus a signed portal token.
 *
 *  The token is signed directly rather than obtained from `/portal/auth/login`
 *  so a read test never depends on Turnstile, the lockout counter, or the login
 *  route at all — those are 02 CP-1's tests. */
export const seedPortalUserWithGrants = async (opts: {
  grants: PortalGrant[];
  customerId?: string;
  contactId?: string;
}): Promise<SeededPortalUser & { token: string }> => {
  const db = createDb((env as { DATABASE_URL: string }).DATABASE_URL);
  const user = await seedPortalUser({ customerId: opts.customerId, contactId: opts.contactId });

  if (opts.grants.length) {
    const grantedBy = await ensureGranter();
    await db
      .insert(portalUserGrants)
      .values(opts.grants.map((grant) => ({ portalUserId: user.id, grant, grantedBy })));
  }

  const token = await signPortalToken(
    (env as { PORTAL_JWT_SECRET: string }).PORTAL_JWT_SECRET,
    user.id,
    user.customerId,
  );
  return { ...user, token };
};

type SeededEquipment = { id: string; name: string };

export const seedEquipment = async (
  customerId: string,
  fields: { name?: string; location?: string; serialNumber?: string } = {},
): Promise<SeededEquipment> => {
  const db = createDb((env as { DATABASE_URL: string }).DATABASE_URL);
  const name = fields.name ?? uniqueName('equipment');
  const [row] = await db
    .insert(equipment)
    .values({
      customerId,
      name,
      location: fields.location ?? null,
      serialNumber: fields.serialNumber ?? null,
    })
    .returning({ id: equipment.id });
  if (!row) throw new Error('seedEquipment returned no row');
  return { id: row.id, name };
};

/** Attach a report to a unit — the many-to-many 11 §2 link the portal reads for
 *  `equipmentNames` and the per-unit history. */
export const linkEquipmentReport = async (
  equipmentId: string,
  reportId: string,
): Promise<void> => {
  const db = createDb((env as { DATABASE_URL: string }).DATABASE_URL);
  await db.insert(equipmentReports).values({ equipmentId, reportId }).onConflictDoNothing();
};

type SeededContract = { id: string; folio: string; fileKey: string; fileName: string };

export const seedContract = async (opts: {
  customerId: string;
  createdBy: string;
  name?: string;
  type?: ContractType;
  validFromDate?: string;
  expiryDate?: string | null;
  fileKey?: string;
  deletedAt?: Date;
}): Promise<SeededContract> => {
  const db = createDb((env as { DATABASE_URL: string }).DATABASE_URL);
  const folio = fixtureFolio('CON');
  const fileName = `${folio}.pdf`;
  const fileKey = opts.fileKey ?? `contracts/test-${tag()}.pdf`;
  const [row] = await db
    .insert(contracts)
    .values({
      folio,
      customerId: opts.customerId,
      name: opts.name ?? uniqueName('contract'),
      type: opts.type ?? ContractType.Guarantee,
      fileKey,
      fileName,
      fileType: ContractFileType.Pdf,
      fileMime: 'application/pdf',
      fileSize: 8,
      validFromDate: opts.validFromDate ?? '2026-01-01',
      expiryDate: opts.expiryDate === undefined ? '2099-12-31' : opts.expiryDate,
      createdBy: opts.createdBy,
      deletedAt: opts.deletedAt ?? null,
    })
    .returning({ id: contracts.id });
  if (!row) throw new Error('seedContract returned no row');
  return { id: row.id, folio, fileKey, fileName };
};

type SeededQuotation = { id: string; folio: string };

export const seedQuotation = async (opts: {
  customerId: string;
  createdBy: string;
  status?: QuotationStatus;
  validUntil?: string;
  serviceOrderId?: string;
  deletedAt?: Date;
  /** One priced line, so the portal's computed `total` has something to sum. */
  withLine?: boolean;
}): Promise<SeededQuotation> => {
  const db = createDb((env as { DATABASE_URL: string }).DATABASE_URL);
  const folio = fixtureFolio('COT');
  const [row] = await db
    .insert(quotations)
    .values({
      folio,
      customerId: opts.customerId,
      status: opts.status ?? QuotationStatus.WaitingApproval,
      validUntil: opts.validUntil ?? '2099-12-31',
      serviceOrderId: opts.serviceOrderId ?? null,
      createdBy: opts.createdBy,
      deletedAt: opts.deletedAt ?? null,
    })
    .returning({ id: quotations.id });
  if (!row) throw new Error('seedQuotation returned no row');

  if (opts.withLine !== false) {
    await db.insert(quotationLines).values({
      quotationId: row.id,
      serviceName: uniqueServiceName('quote-line'),
      unitPrice: '1000.00',
      uom: ServiceUom.Servicio,
      taxRate: ServiceTaxRate.Iva16,
      quantity: '1',
      discountAmount: '0.00',
    });
  }
  return { id: row.id, folio };
};

/** A reviewer recipient on a quotation — what 04 §5's named tally reads. */
export const seedQuotationReviewer = async (opts: {
  quotationId: string;
  contactId: string;
  email: string;
  isReviewer?: boolean;
  response?: QuotationResponse;
}): Promise<void> => {
  const db = createDb((env as { DATABASE_URL: string }).DATABASE_URL);
  await db.insert(quotationRecipients).values({
    quotationId: opts.quotationId,
    contactId: opts.contactId,
    email: opts.email,
    isReviewer: opts.isReviewer ?? true,
    token: `test-token-${tag()}-${tag()}`,
    response: opts.response ?? null,
    respondedAt: opts.response ? new Date() : null,
  });
};

type SeededServiceOrder = { id: string; folio: string };

export const seedServiceOrder = async (opts: {
  customerId: string;
  createdBy: string;
  status?: ServiceOrderStatus;
  location?: string;
  withLine?: boolean;
}): Promise<SeededServiceOrder> => {
  const db = createDb((env as { DATABASE_URL: string }).DATABASE_URL);
  const folio = fixtureFolio('OS');
  const [row] = await db
    .insert(serviceOrders)
    .values({
      folio,
      customerId: opts.customerId,
      status: opts.status ?? ServiceOrderStatus.Open,
      location: opts.location ?? null,
      createdBy: opts.createdBy,
    })
    .returning({ id: serviceOrders.id });
  if (!row) throw new Error('seedServiceOrder returned no row');

  if (opts.withLine !== false) {
    await db.insert(serviceOrderServices).values({
      serviceOrderId: row.id,
      serviceName: uniqueServiceName('order-line'),
      uom: ServiceUom.Servicio,
      taxRate: ServiceTaxRate.Iva16,
      quantity: '1.000',
      unitPrice: '1000.00',
      discountAmount: '0.00',
    });
  }
  return { id: row.id, folio };
};

/** Bind an already-seeded report to an order — the detail's linked list. */
export const attachReportToOrder = async (
  reportId: string,
  serviceOrderId: string,
): Promise<void> => {
  const db = createDb((env as { DATABASE_URL: string }).DATABASE_URL);
  await db.update(reports).set({ serviceOrderId }).where(eq(reports.id, reportId));
};

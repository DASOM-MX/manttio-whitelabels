import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { authHeader, env, request } from '../helpers';
import {
  seedAdmin,
  seedContact,
  seedContract,
  seedCustomer,
  seedPortalUserWithGrants,
  seedQuotation,
  seedReport,
} from '../helpers/fixtures';
import { createDb } from '../../src/modules/database/client';
import {
  contractEvents,
  customerInteractions,
  quotationEvents,
  reportEvents,
} from '../../src/modules/database/schema';
import { ContractEventType } from '../../src/modules/contracts/enums/contracts.enum';
import { PortalGrant } from '../../src/modules/portal/enums/portal-grants.enum';
import {
  QuotationEventType,
  QuotationStatus,
} from '../../src/modules/quotations/enums/quotations.enum';
import { ReportEventType, ReportStatus } from '../../src/modules/reports/enums/reports.enum';

type WorkerEnv = { DATABASE_URL: string; MANTTIO_CONTRACTS: R2Bucket };

/**
 * Every portal download is an audited event (04 §2b, 00 §4b.23).
 *
 * The three assertions the decision actually turns on:
 * - a row per download, **including the second one** — no dedup, no
 *   first-download-only collapse;
 * - `actorId` null, the portal side set (`portalUserId` on the two new
 *   timelines, `contactId` on `quotation_events`, which also serves the emailed
 *   token page);
 * - the row lands on the **entity** timeline only — never a
 *   `customer_interactions` entry, because a fetch is not a commercial touch.
 */

const db = () => createDb((env as unknown as WorkerEnv).DATABASE_URL);
const bucket = () => (env as unknown as WorkerEnv).MANTTIO_CONTRACTS;
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

const countInteractions = async (customerId: string): Promise<number> => {
  const [row] = await db()
    .select({ total: sql<number>`count(*)::int` })
    .from(customerInteractions)
    .where(eq(customerInteractions.customerId, customerId));
  return row?.total ?? 0;
};

const download = (path: string, token: string) =>
  request(path, { method: 'GET', headers: authHeader(token) });

describe('portal download trail', () => {
  let ctx: {
    customerId: string;
    portalUserId: string;
    contactId: string;
    token: string;
    reportId: string;
    contractId: string;
    quotationId: string;
  };

  beforeAll(async () => {
    const admin = await seedAdmin();
    const customer = await seedCustomer();
    const contact = await seedContact(customer.id, { isDefault: true });
    const user = await seedPortalUserWithGrants({
      grants: [
        PortalGrant.ViewReports,
        PortalGrant.ViewContracts,
        PortalGrant.ViewQuotations,
      ],
      customerId: customer.id,
      contactId: contact.id,
    });

    const report = await seedReport({
      createdBy: admin.id,
      clientId: customer.id,
      status: ReportStatus.Finished,
    });
    const contract = await seedContract({ customerId: customer.id, createdBy: admin.id });
    // The download streams the stored object, so it has to exist.
    await bucket().put(contract.fileKey, PDF_BYTES);
    const quotation = await seedQuotation({
      customerId: customer.id,
      createdBy: admin.id,
      status: QuotationStatus.WaitingApproval,
    });

    ctx = {
      customerId: customer.id,
      portalUserId: user.id,
      contactId: contact.id,
      token: user.token,
      reportId: report.id,
      contractId: contract.id,
      quotationId: quotation.id,
    };
  }, 60_000);

  it('writes one report_events row per download, twice for two downloads', async () => {
    const first = await download(`/portal/reports/${ctx.reportId}/pdf`, ctx.token);
    expect(first.status).toBe(200);
    expect(first.headers.get('content-type')).toBe('application/pdf');
    const second = await download(`/portal/reports/${ctx.reportId}/pdf`, ctx.token);
    expect(second.status).toBe(200);

    const rows = await db()
      .select()
      .from(reportEvents)
      .where(eq(reportEvents.reportId, ctx.reportId));

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.type).toBe(ReportEventType.Downloaded);
      expect(row.actorId).toBeNull();
      expect(row.portalUserId).toBe(ctx.portalUserId);
      expect(row.changes).toEqual({ via: 'portal' });
    }
  });

  it('writes one contract_events row per download, twice for two downloads', async () => {
    const first = await download(`/portal/contracts/${ctx.contractId}/pdf`, ctx.token);
    expect(first.status).toBe(200);
    const second = await download(`/portal/contracts/${ctx.contractId}/pdf`, ctx.token);
    expect(second.status).toBe(200);

    const rows = await db()
      .select()
      .from(contractEvents)
      .where(eq(contractEvents.contractId, ctx.contractId));

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.type).toBe(ContractEventType.Downloaded);
      expect(row.actorId).toBeNull();
      expect(row.portalUserId).toBe(ctx.portalUserId);
      expect(row.changes).toEqual({ via: 'portal' });
    }
  });

  it('writes one quotation_events row per download, attributed to the contact', async () => {
    const first = await download(`/portal/quotations/${ctx.quotationId}/pdf`, ctx.token);
    expect(first.status).toBe(200);
    const second = await download(`/portal/quotations/${ctx.quotationId}/pdf`, ctx.token);
    expect(second.status).toBe(200);

    const rows = await db()
      .select()
      .from(quotationEvents)
      .where(
        and(
          eq(quotationEvents.quotationId, ctx.quotationId),
          eq(quotationEvents.type, QuotationEventType.Downloaded),
        ),
      );

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.actorId).toBeNull();
      expect(row.contactId).toBe(ctx.contactId);
      expect(row.refKind).toBeNull();
      expect(row.refId).toBeNull();
      expect(row.changes).toEqual({ via: 'portal' });
    }
  });

  it('writes no customer_interactions row for any download', async () => {
    const before = await countInteractions(ctx.customerId);
    await download(`/portal/reports/${ctx.reportId}/pdf`, ctx.token);
    await download(`/portal/contracts/${ctx.contractId}/pdf`, ctx.token);
    await download(`/portal/quotations/${ctx.quotationId}/pdf`, ctx.token);
    expect(await countInteractions(ctx.customerId)).toBe(before);
  });

  it('serves no bytes for a record outside the token’s scope, and records nothing', async () => {
    const otherCustomer = await seedCustomer();
    const admin = await seedAdmin();
    const foreign = await seedQuotation({
      customerId: otherCustomer.id,
      createdBy: admin.id,
      status: QuotationStatus.WaitingApproval,
    });

    const res = await download(`/portal/quotations/${foreign.id}/pdf`, ctx.token);
    expect(res.status).toBe(404);

    const rows = await db()
      .select()
      .from(quotationEvents)
      .where(eq(quotationEvents.quotationId, foreign.id));
    expect(rows).toHaveLength(0);
  });
});

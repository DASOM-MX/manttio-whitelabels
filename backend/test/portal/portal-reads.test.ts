import { beforeAll, describe, expect, it } from 'vitest';
import { authHeader, json, request } from '../helpers';
import {
  attachReportToOrder,
  linkEquipmentReport,
  seedAdmin,
  seedContact,
  seedContract,
  seedCustomer,
  seedEquipment,
  seedPortalUserWithGrants,
  seedQuotation,
  seedQuotationReviewer,
  seedReport,
  seedServiceOrder,
} from '../helpers/fixtures';
import { PortalGrant } from '../../src/modules/portal/enums/portal-grants.enum';
import {
  QuotationResponse,
  QuotationStatus,
} from '../../src/modules/quotations/enums/quotations.enum';
import { ReportStatus } from '../../src/modules/reports/enums/reports.enum';
import { ServiceOrderStatus } from '../../src/modules/service-orders/enums/service-orders.enum';
import type { GenericQueryResponse } from '../../src/modules/shared/types/generic-query-response.types';

/**
 * Portal read surfaces (04 CP-1) — the three rules that matter, asserted per
 * section:
 *
 * 1. **Scope is the token's `customerId`.** Another customer's record is absent
 *    from every list and 404s on direct access. Nothing in a request ever
 *    carries a customer id.
 * 2. **Only what staff released** (A7). Draft/cancelled/soft-deleted rows are
 *    absent and 404 — a `WHERE`, never a UI concern.
 * 3. **Grants gate the section.** Without the grant the section does not exist
 *    for that user (`requireGrant` answers 404, not 403 — 02 §1: the portal must
 *    not confirm that a section exists to someone not entitled to it).
 */

const ALL_READ_GRANTS = [
  PortalGrant.ViewReports,
  PortalGrant.ViewContracts,
  PortalGrant.ViewQuotations,
  PortalGrant.ViewServiceOrders,
  PortalGrant.ViewEquipment,
];

type Ctx = Awaited<ReturnType<typeof buildContext>>;

const buildContext = async () => {
  const admin = await seedAdmin();

  // --- Customer A: the token's own customer ---
  const customer = await seedCustomer();
  const contact = await seedContact(customer.id, { isDefault: true });
  const reader = await seedPortalUserWithGrants({
    grants: ALL_READ_GRANTS,
    customerId: customer.id,
    contactId: contact.id,
  });
  // A second account on the same customer, holding nothing.
  const noGrants = await seedPortalUserWithGrants({
    grants: [],
    customerId: customer.id,
  });

  const releasedReport = await seedReport({
    createdBy: admin.id,
    clientId: customer.id,
    status: ReportStatus.Finished,
  });
  const draftReport = await seedReport({
    createdBy: admin.id,
    clientId: customer.id,
    status: ReportStatus.InProgress,
  });

  const unit = await seedEquipment(customer.id, { location: 'Azotea norte' });
  await linkEquipmentReport(unit.id, releasedReport.id);

  const liveContract = await seedContract({ customerId: customer.id, createdBy: admin.id });
  const deletedContract = await seedContract({
    customerId: customer.id,
    createdBy: admin.id,
    deletedAt: new Date(),
  });

  const sentQuotation = await seedQuotation({
    customerId: customer.id,
    createdBy: admin.id,
    status: QuotationStatus.WaitingApproval,
  });
  await seedQuotationReviewer({
    quotationId: sentQuotation.id,
    contactId: contact.id,
    email: contact.email,
    response: QuotationResponse.Approved,
  });
  const draftQuotation = await seedQuotation({
    customerId: customer.id,
    createdBy: admin.id,
    status: QuotationStatus.Draft,
  });
  const cancelledQuotation = await seedQuotation({
    customerId: customer.id,
    createdBy: admin.id,
    status: QuotationStatus.Cancelled,
  });

  const openOrder = await seedServiceOrder({
    customerId: customer.id,
    createdBy: admin.id,
    status: ServiceOrderStatus.Open,
    location: 'Planta Apodaca',
  });
  await attachReportToOrder(releasedReport.id, openOrder.id);
  await attachReportToOrder(draftReport.id, openOrder.id);
  const cancelledOrder = await seedServiceOrder({
    customerId: customer.id,
    createdBy: admin.id,
    status: ServiceOrderStatus.Cancelled,
  });

  // --- Customer B: a different tenant customer, same tenant ---
  const otherCustomer = await seedCustomer();
  const otherReport = await seedReport({
    createdBy: admin.id,
    clientId: otherCustomer.id,
    status: ReportStatus.Finished,
  });
  const otherContract = await seedContract({
    customerId: otherCustomer.id,
    createdBy: admin.id,
  });
  const otherQuotation = await seedQuotation({
    customerId: otherCustomer.id,
    createdBy: admin.id,
    status: QuotationStatus.WaitingApproval,
  });
  const otherOrder = await seedServiceOrder({
    customerId: otherCustomer.id,
    createdBy: admin.id,
    status: ServiceOrderStatus.Open,
  });
  const otherUnit = await seedEquipment(otherCustomer.id);

  return {
    admin,
    customer,
    contact,
    reader,
    noGrants,
    releasedReport,
    draftReport,
    unit,
    liveContract,
    deletedContract,
    sentQuotation,
    draftQuotation,
    cancelledQuotation,
    openOrder,
    cancelledOrder,
    other: {
      report: otherReport,
      contract: otherContract,
      quotation: otherQuotation,
      order: otherOrder,
      unit: otherUnit,
    },
  };
};

const get = (path: string, token: string) =>
  request(path, { method: 'GET', headers: authHeader(token) });

describe('portal read surfaces', () => {
  let ctx: Ctx;

  beforeAll(async () => {
    ctx = await buildContext();
  }, 60_000);

  describe('the shared envelope', () => {
    it('every list answers GenericQueryResponse with a real unpaginated total', async () => {
      for (const path of [
        '/portal/reports',
        '/portal/contracts',
        '/portal/quotations',
        '/portal/service-orders',
        '/portal/equipment',
      ]) {
        const res = await get(`${path}?limit=1`, ctx.reader.token);
        expect(res.status, path).toBe(200);
        const body = await json<GenericQueryResponse<unknown>>(res);
        expect(Object.keys(body).sort()).toEqual(['items', 'limit', 'page', 'total']);
        expect(body.page).toBe(1);
        expect(body.limit).toBe(1);
        expect(body.items.length).toBeLessThanOrEqual(1);
        // `total` counts the filter, not the page.
        expect(body.total).toBeGreaterThanOrEqual(body.items.length);
      }
    });
  });

  describe('reportes', () => {
    it('lists only released reports and always names the technician (A13)', async () => {
      const res = await get('/portal/reports?limit=100', ctx.reader.token);
      expect(res.status).toBe(200);
      const body = await json<GenericQueryResponse<{ id: string; technicianName: string | null }>>(res);
      const ids = body.items.map((i) => i.id);
      expect(ids).toContain(ctx.releasedReport.id);
      expect(ids).not.toContain(ctx.draftReport.id);
      expect(ids).not.toContain(ctx.other.report.id);
      expect(body.total).toBe(1);
      expect(body.items[0]?.technicianName).toBeTruthy();
    });

    it('serves the detail with the equipment it covered', async () => {
      const res = await get(`/portal/reports/${ctx.releasedReport.id}`, ctx.reader.token);
      expect(res.status).toBe(200);
      const body = await json<{ id: string; equipmentNames: string[] }>(res);
      expect(body.id).toBe(ctx.releasedReport.id);
      expect(body.equipmentNames).toContain(ctx.unit.name);
    });

    it('404s an unreleased report and another customer’s report', async () => {
      expect((await get(`/portal/reports/${ctx.draftReport.id}`, ctx.reader.token)).status).toBe(404);
      expect((await get(`/portal/reports/${ctx.other.report.id}`, ctx.reader.token)).status).toBe(404);
    });

    it('404s the whole section without view_reports', async () => {
      expect((await get('/portal/reports', ctx.noGrants.token)).status).toBe(404);
      expect(
        (await get(`/portal/reports/${ctx.releasedReport.id}`, ctx.noGrants.token)).status,
      ).toBe(404);
      expect(
        (await get(`/portal/reports/${ctx.releasedReport.id}/pdf`, ctx.noGrants.token)).status,
      ).toBe(404);
    });
  });

  describe('contratos', () => {
    it('lists live contracts only, without the R2 key', async () => {
      const res = await get('/portal/contracts?limit=100', ctx.reader.token);
      expect(res.status).toBe(200);
      const body = await json<GenericQueryResponse<{ id: string }>>(res);
      const ids = body.items.map((i) => i.id);
      expect(ids).toEqual([ctx.liveContract.id]);
      expect(body.total).toBe(1);
      expect(JSON.stringify(body)).not.toContain(ctx.liveContract.fileKey);
    });

    it('404s a soft-deleted contract and another customer’s contract', async () => {
      expect(
        (await get(`/portal/contracts/${ctx.deletedContract.id}`, ctx.reader.token)).status,
      ).toBe(404);
      expect(
        (await get(`/portal/contracts/${ctx.other.contract.id}`, ctx.reader.token)).status,
      ).toBe(404);
    });

    it('404s the whole section without view_contracts', async () => {
      expect((await get('/portal/contracts', ctx.noGrants.token)).status).toBe(404);
      expect(
        (await get(`/portal/contracts/${ctx.liveContract.id}/pdf`, ctx.noGrants.token)).status,
      ).toBe(404);
    });
  });

  describe('cotizaciones', () => {
    it('lists sent quotations only — never draft, never cancelled', async () => {
      const res = await get('/portal/quotations?limit=100', ctx.reader.token);
      expect(res.status).toBe(200);
      const body = await json<GenericQueryResponse<{ id: string; total: string }>>(res);
      const ids = body.items.map((i) => i.id);
      expect(ids).toEqual([ctx.sentQuotation.id]);
      expect(body.total).toBe(1);
      // Money is summed from the frozen lines, never stored.
      expect(body.items[0]?.total).toBe('1160.00');
    });

    it('names the reviewers and how each answered (A14)', async () => {
      const res = await get(`/portal/quotations/${ctx.sentQuotation.id}`, ctx.reader.token);
      expect(res.status).toBe(200);
      const body = await json<{
        reviewers: { contactName: string | null; response: string | null }[];
      }>(res);
      expect(body.reviewers).toHaveLength(1);
      expect(body.reviewers[0]?.contactName).toBe(ctx.contact.name);
      expect(body.reviewers[0]?.response).toBe(QuotationResponse.Approved);
      // Another contact's address is never part of the answer.
      expect(JSON.stringify(body)).not.toContain(ctx.contact.email);
    });

    it('404s draft, cancelled and another customer’s quotation', async () => {
      expect(
        (await get(`/portal/quotations/${ctx.draftQuotation.id}`, ctx.reader.token)).status,
      ).toBe(404);
      expect(
        (await get(`/portal/quotations/${ctx.cancelledQuotation.id}`, ctx.reader.token)).status,
      ).toBe(404);
      expect(
        (await get(`/portal/quotations/${ctx.other.quotation.id}`, ctx.reader.token)).status,
      ).toBe(404);
    });

    it('a status filter cannot widen past the released set', async () => {
      const res = await get('/portal/quotations?status=draft', ctx.reader.token);
      expect(res.status).toBe(200);
      const body = await json<GenericQueryResponse<unknown>>(res);
      expect(body.total).toBe(0);
    });

    it('404s the whole section without view_quotations', async () => {
      expect((await get('/portal/quotations', ctx.noGrants.token)).status).toBe(404);
      expect(
        (await get(`/portal/quotations/${ctx.sentQuotation.id}/pdf`, ctx.noGrants.token)).status,
      ).toBe(404);
    });
  });

  describe('órdenes de servicio', () => {
    it('lists open/completed orders and never exposes priority (A15)', async () => {
      const res = await get('/portal/service-orders?limit=100', ctx.reader.token);
      expect(res.status).toBe(200);
      const body = await json<GenericQueryResponse<{ id: string; reportCount: number }>>(res);
      const ids = body.items.map((i) => i.id);
      expect(ids).toEqual([ctx.openOrder.id]);
      expect(body.total).toBe(1);
      expect(Object.keys(body.items[0] ?? {})).not.toContain('priority');
      // Counts released reports only — the count must not promise a document
      // that 404s.
      expect(body.items[0]?.reportCount).toBe(1);
    });

    it('detail links only the released reports and shows visits with window + status', async () => {
      const res = await get(`/portal/service-orders/${ctx.openOrder.id}`, ctx.reader.token);
      expect(res.status).toBe(200);
      const body = await json<{
        linkedReports: { id: string }[];
        visits: { scheduledStart: string; scheduledEnd: string | null; status: string }[];
        lines: { serviceName: string }[];
      }>(res);
      expect(body.linkedReports.map((r) => r.id)).toEqual([ctx.releasedReport.id]);
      expect(Array.isArray(body.visits)).toBe(true);
      for (const visit of body.visits) {
        expect(Object.keys(visit).sort()).toEqual(['scheduledEnd', 'scheduledStart', 'status']);
      }
      expect(body.lines.length).toBe(1);
      expect(Object.keys(body)).not.toContain('comments');
    });

    it('404s a cancelled order and another customer’s order', async () => {
      expect(
        (await get(`/portal/service-orders/${ctx.cancelledOrder.id}`, ctx.reader.token)).status,
      ).toBe(404);
      expect(
        (await get(`/portal/service-orders/${ctx.other.order.id}`, ctx.reader.token)).status,
      ).toBe(404);
    });

    it('404s the whole section without view_service_orders', async () => {
      expect((await get('/portal/service-orders', ctx.noGrants.token)).status).toBe(404);
    });
  });

  describe('equipos (A8 — one endpoint, two entitlements)', () => {
    it('lists the customer’s own units with their last released service', async () => {
      const res = await get('/portal/equipment?limit=100', ctx.reader.token);
      expect(res.status).toBe(200);
      const body = await json<GenericQueryResponse<{ id: string; lastServiceDate: string | null }>>(res);
      expect(body.items.map((i) => i.id)).toEqual([ctx.unit.id]);
      expect(body.total).toBe(1);
      expect(body.items[0]?.lastServiceDate).toBeTruthy();
    });

    it('is reachable with create_service_requests alone — the form’s picker', async () => {
      const picker = await seedPortalUserWithGrants({
        grants: [PortalGrant.CreateServiceRequests],
        customerId: ctx.customer.id,
      });
      const res = await get('/portal/equipment', picker.token);
      expect(res.status).toBe(200);
    });

    it('each detail sub-list obeys its own grant', async () => {
      const equipmentOnly = await seedPortalUserWithGrants({
        grants: [PortalGrant.ViewEquipment],
        customerId: ctx.customer.id,
      });

      const bare = await json<{ linkedReports: unknown[]; linkedServiceRequests: unknown[] }>(
        await get(`/portal/equipment/${ctx.unit.id}`, equipmentOnly.token),
      );
      expect(bare.linkedReports).toEqual([]);
      expect(bare.linkedServiceRequests).toEqual([]);

      const withReports = await json<{ linkedReports: { id: string }[] }>(
        await get(`/portal/equipment/${ctx.unit.id}`, ctx.reader.token),
      );
      expect(withReports.linkedReports.map((r) => r.id)).toEqual([ctx.releasedReport.id]);
    });

    it('404s another customer’s unit, and the section with neither grant', async () => {
      expect(
        (await get(`/portal/equipment/${ctx.other.unit.id}`, ctx.reader.token)).status,
      ).toBe(404);
      expect((await get('/portal/equipment', ctx.noGrants.token)).status).toBe(404);
    });
  });

  describe('nothing reaches these routes without a portal token', () => {
    it('401s every section with no Authorization header', async () => {
      for (const path of [
        '/portal/reports',
        '/portal/contracts',
        '/portal/quotations',
        '/portal/service-orders',
        '/portal/equipment',
      ]) {
        const res = await request(path, { method: 'GET' });
        expect(res.status, path).toBe(401);
      }
    });
  });
});

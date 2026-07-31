import { afterAll, describe, expect, test } from 'vitest';
import { inArray } from 'drizzle-orm';
import { env, json, jsonHeaders, request } from './helpers/request';
import {
  seedContact,
  seedCustomer,
  seedOfficeAndLogin,
  seedOwnerAndLogin,
  seedTechnicianAndLogin,
  uniqueServiceName,
} from './helpers/fixtures';
import { allResendSends, mockResend } from './helpers/resend';
import { createDb } from '../src/modules/database/client';
import { quotations, reports, serviceOrders } from '../src/modules/database/schema';
import { ServiceTaxRate, ServiceUom } from '../src/modules/services/enums/services.enum';
import {
  QuotationEventType,
  QuotationResponse,
  QuotationStatus,
} from '../src/modules/quotations/enums/quotations.enum';

type WorkerEnv = { DATABASE_URL: string };

type Line = {
  id: string;
  serviceId?: string;
  serviceName: string;
  description?: string;
  unitPrice: string;
  uom: ServiceUom;
  taxRate: ServiceTaxRate;
  quantity: string;
  discountAmount: string;
  lineSubtotal: string;
};

type Recipient = {
  id: string;
  contactId: string;
  contactName?: string;
  email: string;
  isReviewer: boolean;
  viewedAt?: string;
  respondedAt?: string;
  response?: QuotationResponse;
  responseReason?: string;
  token?: string;
};

type Quotation = {
  id: string;
  folio: string;
  customerId: string;
  customerName: string;
  status: QuotationStatus;
  validUntil: string;
  isOverdue: boolean;
  total: string;
  tally: { reviewers: number; approved: number; declined: number; pending: number };
  comments?: string;
  supersedesQuotationId?: string;
  sentAt?: string;
  resolutionReason?: string;
  serviceOrderId?: string;
  lines: Line[];
  recipients: Recipient[];
  totals: { subtotal: string; discount: string; iva: string; total: string };
};

type TimelineEvent = {
  type: QuotationEventType;
  contactId?: string;
  note?: string;
  changes?: Record<string, unknown>;
};

type PublicView = {
  folio: string;
  customerName: string;
  status: QuotationStatus;
  isOverdue: boolean;
  lines: Line[];
  totals: { subtotal: string; discount: string; iva: string; total: string };
  viewer: { isReviewer: boolean; response?: QuotationResponse; responseReason?: string };
  canRespond: boolean;
};

mockResend();

// Quotations carry no fixture-email column, so the suite tracks the ids it
// creates and soft-deletes exactly those — never a hard delete, the fork rule
// applies to fixtures too. Lines/recipients/events are append-only children and
// stay put; they fall out of every read path once the parent is tombstoned.
const created: string[] = [];

afterAll(async () => {
  if (created.length === 0) return;
  const db = createDb((env as unknown as WorkerEnv).DATABASE_URL);
  await db
    .update(quotations)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(inArray(quotations.id, created));
});

const dayOffset = (days: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const makeService = async (
  token: string,
  overrides: { price?: number; taxRate?: ServiceTaxRate; uom?: ServiceUom } = {},
) => {
  const res = await request('/services', {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({
      name: uniqueServiceName('quote'),
      price: overrides.price ?? 1000,
      uom: overrides.uom ?? ServiceUom.Servicio,
      taxRate: overrides.taxRate ?? ServiceTaxRate.Iva16,
      description: 'Descripción de catálogo',
    }),
  });
  expect(res.status).toBe(201);
  return json<{ id: string; name: string; price: string }>(res);
};

const createQuote = async (token: string, body: object) =>
  request('/quotations', { method: 'POST', headers: jsonHeaders(token), body: JSON.stringify(body) });

const post = (token: string, path: string, body: object) =>
  request(path, { method: 'POST', headers: jsonHeaders(token), body: JSON.stringify(body) });

/** A customer + one contact + one service + a draft quote for one unit. */
const scenario = async (opts: { price?: number; taxRate?: ServiceTaxRate; quantity?: string } = {}) => {
  const { owner, token } = await seedOwnerAndLogin();
  const customer = await seedCustomer();
  const contact = await seedContact(customer.id, { isDefault: true });
  const service = await makeService(token, { price: opts.price, taxRate: opts.taxRate });
  const res = await createQuote(token, {
    customerId: customer.id,
    validUntil: dayOffset(30),
    comments: 'Condiciones de prueba',
    lines: [{ serviceId: service.id, quantity: opts.quantity ?? '1' }],
  });
  expect(res.status).toBe(201);
  const quote = await json<Quotation>(res);
  created.push(quote.id);
  return { owner, token, customer, contact, service, quote };
};

/** Sends and returns the recipient tokens, read straight from the DB — the API
 *  never discloses them, which is itself asserted below. */
const sendAndGetTokens = async (
  token: string,
  quotationId: string,
  recipients: { contactId: string; isReviewer: boolean }[],
) => {
  const res = await post(token, `/quotations/${quotationId}/send`, { recipients });
  expect(res.status).toBe(200);
  const body = await json<{ quotation: Quotation; delivery: { sent: number } }>(res);
  const db = createDb((env as unknown as WorkerEnv).DATABASE_URL);
  const rows = await db.query.quotationRecipients.findMany({
    where: (r, { eq }) => eq(r.quotationId, quotationId),
  });
  const byContact = new Map(rows.map((r) => [r.contactId, r.token]));
  return { body, tokenFor: (contactId: string) => byContact.get(contactId) as string };
};

describe('quotations — draft + snapshots (20 §1)', () => {
  test('resolves catalog snapshots server-side and computes per-line totals', async () => {
    const { quote, service } = await scenario({ price: 1500, quantity: '2' });

    expect(quote.folio).toMatch(/^COT-\d{8}-\d{4}$/);
    expect(quote.status).toBe(QuotationStatus.Draft);
    expect(quote.isOverdue).toBe(false);
    expect(quote.lines).toHaveLength(1);

    const [line] = quote.lines;
    expect(line?.serviceId).toBe(service.id);
    expect(line?.serviceName).toBe(service.name);
    // Price/uom/taxRate were never sent by the client — the server read them.
    expect(line?.unitPrice).toBe('1500.00');
    expect(line?.uom).toBe(ServiceUom.Servicio);
    expect(line?.taxRate).toBe(ServiceTaxRate.Iva16);
    expect(line?.lineSubtotal).toBe('3000.00');
    // The catalog description is snapshotted when no override is given.
    expect(line?.description).toBe('Descripción de catálogo');

    expect(quote.totals).toEqual({ subtotal: '3000.00', discount: '0.00', iva: '480.00', total: '3480.00' });
  });

  test('a client cannot dictate price, uom or tax rate on a catalog line', async () => {
    const { owner, token } = await seedOwnerAndLogin();
    void owner;
    const customer = await seedCustomer();
    const service = await makeService(token, { price: 800 });
    const res = await createQuote(token, {
      customerId: customer.id,
      validUntil: dayOffset(15),
      lines: [
        { serviceId: service.id, quantity: '1', unitPrice: '1.00', taxRate: ServiceTaxRate.Exento },
      ],
    });
    // Rejected outright since line model v2 (before it, the fields were
    // silently ignored): the same fields ARE the snapshot on an off-catalog
    // line, so on a catalog line they now collide instead of vanishing.
    expect(res.status).toBe(400);
  });

  test('sums IVA per line, so a mixed-rate quote is exact', async () => {
    const { token } = await seedOwnerAndLogin();
    const customer = await seedCustomer();
    const taxed = await makeService(token, { price: 1000, taxRate: ServiceTaxRate.Iva16 });
    const exempt = await makeService(token, { price: 500, taxRate: ServiceTaxRate.Exento });
    const border = await makeService(token, { price: 200, taxRate: ServiceTaxRate.Iva8 });
    const res = await createQuote(token, {
      customerId: customer.id,
      validUntil: dayOffset(10),
      lines: [
        { serviceId: taxed.id, quantity: '1' },
        { serviceId: exempt.id, quantity: '2' },
        { serviceId: border.id, quantity: '3' },
      ],
    });
    const quote = await json<Quotation>(res);
    created.push(quote.id);
    // 1000@16% = 160 · 1000@exento = 0 · 600@8% = 48  →  subtotal 2600, iva 208
    expect(quote.totals).toEqual({ subtotal: '2600.00', discount: '0.00', iva: '208.00', total: '2808.00' });
  });

  test('a later catalog price change never rewrites an existing quote', async () => {
    const { quote, service, token } = await scenario({ price: 1000 });
    const bump = await request(`/services/${service.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(token),
      body: JSON.stringify({ price: 9999 }),
    });
    expect(bump.status).toBe(200);

    const after = await json<Quotation>(await request(`/quotations/${quote.id}`, {
      headers: jsonHeaders(token),
    }));
    expect(after.lines[0]?.unitPrice).toBe('1000.00');
    expect(after.totals.subtotal).toBe('1000.00');
  });

  test('a line referencing a deleted service is rejected by id', async () => {
    const { token } = await seedOwnerAndLogin();
    const customer = await seedCustomer();
    const service = await makeService(token);
    const del = await request(`/services/${service.id}`, {
      method: 'DELETE',
      headers: jsonHeaders(token),
      body: JSON.stringify({ deleteComment: 'fixture' }),
    });
    expect(del.status).toBe(200);

    const res = await createQuote(token, {
      customerId: customer.id,
      validUntil: dayOffset(10),
      lines: [{ serviceId: service.id, quantity: '1' }],
    });
    expect(res.status).toBe(400);
    const body = await json<{ error: string; serviceId: string }>(res);
    expect(body.error).toBe('service_not_found');
    expect(body.serviceId).toBe(service.id);
  });

  test('opens its timeline with a created event and one per line', async () => {
    const { quote, token } = await scenario();
    const events = await json<TimelineEvent[]>(
      await request(`/quotations/${quote.id}/timeline`, { headers: jsonHeaders(token) }),
    );
    expect(events.map((e) => e.type)).toEqual([
      QuotationEventType.Created,
      QuotationEventType.LineAdded,
    ]);
  });
});

describe('quotations — draft-only edits (20 §9)', () => {
  test('patches a draft and replaces its line set', async () => {
    const { quote, token, service } = await scenario({ price: 1000 });
    const res = await request(`/quotations/${quote.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(token),
      body: JSON.stringify({
        comments: 'Actualizado',
        lines: [{ serviceId: service.id, quantity: '4', description: 'Nota por partida' }],
      }),
    });
    expect(res.status).toBe(200);
    const updated = await json<Quotation>(res);
    expect(updated.comments).toBe('Actualizado');
    expect(updated.lines).toHaveLength(1);
    expect(updated.lines[0]?.quantity).toBe('4.000');
    // The per-line override wins over the catalog description.
    expect(updated.lines[0]?.description).toBe('Nota por partida');
    expect(updated.totals.subtotal).toBe('4000.00');
  });

  test('409s once the quote has been sent', async () => {
    const { quote, token, contact } = await scenario();
    await sendAndGetTokens(token, quote.id, [{ contactId: contact.id, isReviewer: true }]);

    const res = await request(`/quotations/${quote.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(token),
      body: JSON.stringify({ comments: 'demasiado tarde' }),
    });
    expect(res.status).toBe(409);
    expect((await json<{ error: string }>(res)).error).toBe('quotation_not_draft');
  });
});

describe('quotations — send + recipients (20 §4)', () => {
  test('mints a token per contact, mails each one, and moves to waiting_approval', async () => {
    const { quote, token, contact } = await scenario();
    const { body } = await sendAndGetTokens(token, quote.id, [
      { contactId: contact.id, isReviewer: true },
    ]);

    expect(body.quotation.status).toBe(QuotationStatus.WaitingApproval);
    expect(body.quotation.sentAt).toBeTruthy();
    expect(body.delivery.sent).toBe(1);
    expect(body.quotation.tally).toEqual({ reviewers: 1, approved: 0, declined: 0, pending: 1 });

    const sends = allResendSends();
    expect(sends).toHaveLength(1);
    expect(sends[0]?.to).toBe(contact.email);
    expect(sends[0]?.subject).toContain(quote.folio);
    // A reviewer is told they can respond; the link is the public token page.
    expect(sends[0]?.text).toContain('/public/quotations/');
    expect(sends[0]?.text).toContain('aprobarla o rechazarla');
  });

  test('never returns a recipient token to staff', async () => {
    const { quote, token, contact } = await scenario();
    const { body } = await sendAndGetTokens(token, quote.id, [
      { contactId: contact.id, isReviewer: true },
    ]);
    const [recipient] = body.quotation.recipients;
    expect(recipient?.email).toBe(contact.email);
    expect(recipient?.token).toBeUndefined();
    expect(JSON.stringify(body.quotation)).not.toContain('token');
  });

  test('rejects a contact belonging to another customer', async () => {
    const { quote, token } = await scenario();
    const otherCustomer = await seedCustomer();
    const outsider = await seedContact(otherCustomer.id);

    const res = await post(token, `/quotations/${quote.id}/send`, {
      recipients: [{ contactId: outsider.id, isReviewer: true }],
    });
    expect(res.status).toBe(400);
    const body = await json<{ error: string; contactId: string }>(res);
    expect(body.error).toBe('invalid_recipient');
    expect(body.contactId).toBe(outsider.id);
    // Nothing was mailed — the send fails whole rather than partially.
    expect(allResendSends()).toHaveLength(0);
  });

  test('rejects the same contact twice in one send', async () => {
    const { quote, token, contact } = await scenario();
    // The recipient upsert writes the whole list in one statement, and Postgres
    // refuses an ON CONFLICT that would touch the same row twice — this used to
    // surface as a 500 carrying the raw driver message.
    const res = await post(token, `/quotations/${quote.id}/send`, {
      recipients: [
        { contactId: contact.id, isReviewer: true },
        { contactId: contact.id, isReviewer: false },
      ],
    });
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain('ON CONFLICT');
    expect(allResendSends()).toHaveLength(0);
  });

  test('an all-informational send is allowed and simply has nothing to tally', async () => {
    const { quote, token, contact } = await scenario();
    const { body } = await sendAndGetTokens(token, quote.id, [
      { contactId: contact.id, isReviewer: false },
    ]);
    expect(body.quotation.status).toBe(QuotationStatus.WaitingApproval);
    expect(body.quotation.tally.reviewers).toBe(0);
    expect(allResendSends()[0]?.text).not.toContain('aprobarla o rechazarla');
  });

  test('a re-send keeps the existing token so the mailed link stays valid', async () => {
    const { quote, token, contact } = await scenario();
    const first = await sendAndGetTokens(token, quote.id, [
      { contactId: contact.id, isReviewer: false },
    ]);
    const firstToken = first.tokenFor(contact.id);

    const second = await sendAndGetTokens(token, quote.id, [
      { contactId: contact.id, isReviewer: true },
    ]);
    expect(second.tokenFor(contact.id)).toBe(firstToken);
    // One row, not two — and the reviewer flag was upgraded in place.
    expect(second.body.quotation.recipients).toHaveLength(1);
    expect(second.body.quotation.recipients[0]?.isReviewer).toBe(true);
    expect(second.body.quotation.tally.reviewers).toBe(1);
    // `sentAt` records when the quote first left the building.
    expect(second.body.quotation.sentAt).toBe(first.body.quotation.sentAt);
  });
});

describe('quotations — token page + reviewer tally (20 §2, §4)', () => {
  test('serves the quote to a token holder and records the first view only', async () => {
    const { quote, token, contact } = await scenario({ price: 2000 });
    const { tokenFor } = await sendAndGetTokens(token, quote.id, [
      { contactId: contact.id, isReviewer: true },
    ]);
    const link = `/public/quotations/${tokenFor(contact.id)}`;

    const view = await json<PublicView>(await request(link));
    expect(view.folio).toBe(quote.folio);
    expect(view.viewer.isReviewer).toBe(true);
    expect(view.canRespond).toBe(true);
    expect(view.totals.total).toBe('2320.00');

    await request(link);
    const events = await json<TimelineEvent[]>(
      await request(`/quotations/${quote.id}/timeline`, { headers: jsonHeaders(token) }),
    );
    expect(events.filter((e) => e.type === QuotationEventType.Viewed)).toHaveLength(1);
  });

  test('an unknown token is 404, never a hint that it might exist', async () => {
    const res = await request('/public/quotations/definitely-not-a-real-token');
    expect(res.status).toBe(404);
    expect((await json<{ error: string }>(res)).error).toBe('not_found');
  });

  test('derives waiting → partially_approved → approved across two reviewers', async () => {
    const { quote, token, customer, contact } = await scenario();
    const second = await seedContact(customer.id);
    const { tokenFor } = await sendAndGetTokens(token, quote.id, [
      { contactId: contact.id, isReviewer: true },
      { contactId: second.id, isReviewer: true },
    ]);

    const first = await json<PublicView>(
      await post('', `/public/quotations/${tokenFor(contact.id)}/respond`, {
        response: QuotationResponse.Approved,
      }),
    );
    expect(first.status).toBe(QuotationStatus.PartiallyApproved);

    const both = await json<PublicView>(
      await post('', `/public/quotations/${tokenFor(second.id)}/respond`, {
        response: QuotationResponse.Approved,
      }),
    );
    expect(both.status).toBe(QuotationStatus.Approved);

    const staffView = await json<Quotation>(
      await request(`/quotations/${quote.id}`, { headers: jsonHeaders(token) }),
    );
    expect(staffView.tally).toEqual({ reviewers: 2, approved: 2, declined: 0, pending: 0 });
  });

  test('all reviewers declining is a live state, not a cancellation', async () => {
    const { quote, token, contact } = await scenario();
    const { tokenFor } = await sendAndGetTokens(token, quote.id, [
      { contactId: contact.id, isReviewer: true },
    ]);
    const view = await json<PublicView>(
      await post('', `/public/quotations/${tokenFor(contact.id)}/respond`, {
        response: QuotationResponse.Declined,
        reason: 'Precio fuera de presupuesto',
      }),
    );
    expect(view.status).toBe(QuotationStatus.Declined);
    // Declined stays actionable — staff may still convert it (owner/admin
    // override) and the reviewer may still change their mind.
    expect(view.canRespond).toBe(true);

    const staffView = await json<Quotation>(
      await request(`/quotations/${quote.id}`, { headers: jsonHeaders(token) }),
    );
    expect(staffView.recipients[0]?.responseReason).toBe('Precio fuera de presupuesto');
  });

  test('a reviewer may change their mind, and every change is re-logged', async () => {
    const { quote, token, contact } = await scenario();
    const { tokenFor } = await sendAndGetTokens(token, quote.id, [
      { contactId: contact.id, isReviewer: true },
    ]);
    const link = `/public/quotations/${tokenFor(contact.id)}/respond`;

    await post('', link, { response: QuotationResponse.Approved });
    const flipped = await json<PublicView>(
      await post('', link, { response: QuotationResponse.Declined, reason: 'Lo reconsideramos' }),
    );
    expect(flipped.status).toBe(QuotationStatus.Declined);

    const backAgain = await json<PublicView>(
      await post('', link, { response: QuotationResponse.Approved }),
    );
    expect(backAgain.status).toBe(QuotationStatus.Approved);

    const events = await json<TimelineEvent[]>(
      await request(`/quotations/${quote.id}/timeline`, { headers: jsonHeaders(token) }),
    );
    // Three responses, three rows — the sequence is the evidence.
    expect(events.filter((e) => e.type === QuotationEventType.ReviewerResponded)).toHaveLength(3);
    expect(
      events.filter((e) => e.type === QuotationEventType.StatusDerived).length,
    ).toBeGreaterThanOrEqual(3);
  });

  test('an informational recipient cannot respond', async () => {
    const { quote, token, contact } = await scenario();
    const { tokenFor } = await sendAndGetTokens(token, quote.id, [
      { contactId: contact.id, isReviewer: false },
    ]);
    const res = await post('', `/public/quotations/${tokenFor(contact.id)}/respond`, {
      response: QuotationResponse.Approved,
    });
    expect(res.status).toBe(403);
    expect((await json<{ error: string }>(res)).error).toBe('not_a_reviewer');
  });

  test('a decline must say why', async () => {
    const { quote, token, contact } = await scenario();
    const { tokenFor } = await sendAndGetTokens(token, quote.id, [
      { contactId: contact.id, isReviewer: true },
    ]);
    const res = await post('', `/public/quotations/${tokenFor(contact.id)}/respond`, {
      response: QuotationResponse.Declined,
    });
    expect(res.status).toBe(400);
  });

  test('an expired quote stays readable but refuses the answer', async () => {
    const { token } = await seedOwnerAndLogin();
    const customer = await seedCustomer();
    const contact = await seedContact(customer.id);
    const service = await makeService(token);
    const res = await createQuote(token, {
      customerId: customer.id,
      // Yesterday — `validUntil` is a guard, not a status (20 §2).
      validUntil: dayOffset(-1),
      lines: [{ serviceId: service.id, quantity: '1' }],
    });
    const quote = await json<Quotation>(res);
    created.push(quote.id);
    expect(quote.isOverdue).toBe(true);

    const { tokenFor } = await sendAndGetTokens(token, quote.id, [
      { contactId: contact.id, isReviewer: true },
    ]);
    const view = await json<PublicView>(await request(`/public/quotations/${tokenFor(contact.id)}`));
    expect(view.isOverdue).toBe(true);
    expect(view.canRespond).toBe(false);
    // The lines are still visible — an expired link is not a dead end.
    expect(view.lines).toHaveLength(1);

    const denied = await post('', `/public/quotations/${tokenFor(contact.id)}/respond`, {
      response: QuotationResponse.Approved,
    });
    expect(denied.status).toBe(409);
    const body = await json<{ error: string; reason: string }>(denied);
    expect(body.error).toBe('quotation_closed');
    expect(body.reason).toBe('expired');
  });
});

describe('quotations — terminal actions (20 §2)', () => {
  test('cancel requires a comment and is terminal', async () => {
    const { quote, token, contact } = await scenario();

    const noComment = await post(token, `/quotations/${quote.id}/cancel`, { comment: '   ' });
    expect(noComment.status).toBe(400);

    const res = await post(token, `/quotations/${quote.id}/cancel`, {
      comment: 'El cliente pospuso el proyecto',
    });
    expect(res.status).toBe(200);
    const cancelled = await json<Quotation>(res);
    expect(cancelled.status).toBe(QuotationStatus.Cancelled);
    expect(cancelled.resolutionReason).toBe('El cliente pospuso el proyecto');

    // Terminal: no further lifecycle action lands.
    const resend = await post(token, `/quotations/${quote.id}/send`, {
      recipients: [{ contactId: contact.id, isReviewer: true }],
    });
    expect(resend.status).toBe(409);
    expect((await json<{ error: string }>(resend)).error).toBe('quotation_not_live');
  });

  test('revise opens a linked draft at current prices and cancels the original', async () => {
    const { quote, token, service } = await scenario({ price: 1000 });
    const bump = await request(`/services/${service.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(token),
      body: JSON.stringify({ price: 1200 }),
    });
    expect(bump.status).toBe(200);

    const res = await post(token, `/quotations/${quote.id}/revise`, {});
    expect(res.status).toBe(201);
    const revision = await json<Quotation>(res);
    created.push(revision.id);

    expect(revision.status).toBe(QuotationStatus.Draft);
    expect(revision.supersedesQuotationId).toBe(quote.id);
    expect(revision.folio).not.toBe(quote.folio);
    // The whole point of revising: the new draft re-read the catalog.
    expect(revision.lines[0]?.unitPrice).toBe('1200.00');

    const original = await json<Quotation>(
      await request(`/quotations/${quote.id}`, { headers: jsonHeaders(token) }),
    );
    expect(original.status).toBe(QuotationStatus.Cancelled);
    expect(original.resolutionReason).toContain(quote.folio);
  });

  test('the conversion body demands the explosion inputs — a bare comment is a 400', async () => {
    // Until 2026-07-27 this asserted a 404: /order was deferred to 19 and
    // `order_created` was unreachable. The endpoint exists now (the convergence
    // suite below); what remains true is that the original `{ comment }`-only
    // sketch is not enough — 19 §2's report invariants make the per-service
    // assignments mandatory, so the old body shape is rejected outright.
    const { quote, token } = await scenario();
    const res = await post(token, `/quotations/${quote.id}/order`, { comment: 'vamos' });
    expect(res.status).toBe(400);
    const staffView = await json<Quotation>(
      await request(`/quotations/${quote.id}`, { headers: jsonHeaders(token) }),
    );
    expect(staffView.serviceOrderId).toBeUndefined();
  });
});

describe('quotations — audited soft delete', () => {
  test('requires a comment, hides the quote, and kills the mailed links', async () => {
    const { quote, token, contact } = await scenario();
    const { tokenFor } = await sendAndGetTokens(token, quote.id, [
      { contactId: contact.id, isReviewer: true },
    ]);
    const link = `/public/quotations/${tokenFor(contact.id)}`;
    expect((await request(link)).status).toBe(200);

    const noComment = await request(`/quotations/${quote.id}`, {
      method: 'DELETE',
      headers: jsonHeaders(token),
      body: JSON.stringify({ deleteComment: '  ' }),
    });
    expect(noComment.status).toBe(400);

    const res = await request(`/quotations/${quote.id}`, {
      method: 'DELETE',
      headers: jsonHeaders(token),
      body: JSON.stringify({ deleteComment: 'Duplicada' }),
    });
    expect(res.status).toBe(200);
    expect(await json<{ deleted: boolean }>(res)).toMatchObject({ deleted: true });

    // Gone from every read path, the recipient token included.
    expect((await request(`/quotations/${quote.id}`, { headers: jsonHeaders(token) })).status).toBe(404);
    expect((await request(link)).status).toBe(404);

    // Soft only — the row and its audit fields are still there.
    const db = createDb((env as unknown as WorkerEnv).DATABASE_URL);
    const row = await db.query.quotations.findFirst({
      where: (q, { eq }) => eq(q.id, quote.id),
    });
    expect(row?.deletedAt).toBeTruthy();
    expect(row?.deleteComment).toBe('Duplicada');
    expect(row?.deletedBy).toBeTruthy();
  });

  test('office can cancel but not delete', async () => {
    const { quote } = await scenario();
    const { token: officeToken } = await seedOfficeAndLogin();
    const res = await request(`/quotations/${quote.id}`, {
      method: 'DELETE',
      headers: jsonHeaders(officeToken),
      body: JSON.stringify({ deleteComment: 'no debería' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('quotations — access (20 §7)', () => {
  test('office can build and send', async () => {
    const { token: ownerToken } = await seedOwnerAndLogin();
    const { token: officeToken } = await seedOfficeAndLogin();
    const customer = await seedCustomer();
    const service = await makeService(ownerToken);

    const res = await createQuote(officeToken, {
      customerId: customer.id,
      validUntil: dayOffset(7),
      lines: [{ serviceId: service.id, quantity: '1' }],
    });
    expect(res.status).toBe(201);
    created.push((await json<Quotation>(res)).id);
  });

  test('technicians have no quotation surface at all', async () => {
    const { quote } = await scenario();
    const { token: techToken } = await seedTechnicianAndLogin();

    expect((await request('/quotations', { headers: jsonHeaders(techToken) })).status).toBe(403);
    expect(
      (await request(`/quotations/${quote.id}`, { headers: jsonHeaders(techToken) })).status,
    ).toBe(403);
    expect(
      (await post(techToken, `/quotations/${quote.id}/cancel`, { comment: 'no' })).status,
    ).toBe(403);
  });

  test('the list is unauthenticated-proof and filters by status', async () => {
    expect((await request('/quotations')).status).toBe(401);

    const { quote, token } = await scenario();
    const res = await request(`/quotations?status=${QuotationStatus.Draft}&customerId=${quote.customerId}`, {
      headers: jsonHeaders(token),
    });
    expect(res.status).toBe(200);
    const page = await json<{ items: Quotation[]; total: number }>(res);
    expect(page.items.map((q) => q.id)).toContain(quote.id);
    expect(page.items.every((q) => q.status === QuotationStatus.Draft)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The convergence (20 §6, linked 2026-07-27): POST /quotations/:id/order
// ---------------------------------------------------------------------------

describe('quotations → service order (20 §6)', () => {
  // Orders born here reference the same `test+`-named services; tombstone them
  // and their exploded reports on the way out (soft delete only, as ever).
  const convertedOrders: string[] = [];

  afterAll(async () => {
    if (convertedOrders.length === 0) return;
    const db = createDb((env as unknown as WorkerEnv).DATABASE_URL);
    await db
      .update(reports)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(inArray(reports.serviceOrderId, convertedOrders));
    await db
      .update(serviceOrders)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(inArray(serviceOrders.id, convertedOrders));
  });

  type OrderDetail = {
    id: string;
    folio: string;
    quotationId?: string;
    customerId: string;
    status: string;
    location?: string;
    servicesCount: number;
    amounts?: { subtotal: string; tax: string; total: string };
    lines: { serviceId: string; serviceName: string; unitPrice?: string; quantity: number }[];
  };

  const convert = (token: string, quotationId: string, body: object) =>
    post(token, `/quotations/${quotationId}/order`, body);

  const assignmentFor = (serviceId: string, technicianId: string) => ({
    serviceId,
    technicianId,
    reportType: 'minisplit',
  });

  /** Draft → sent to one reviewer → approved via their token. */
  const approvedScenario = async (opts: { price?: number; quantity?: string } = {}) => {
    const base = await scenario(opts);
    const { tokenFor } = await sendAndGetTokens(base.token, base.quote.id, [
      { contactId: base.contact.id, isReviewer: true },
    ]);
    const approve = await post('', `/public/quotations/${tokenFor(base.contact.id)}/respond`, {
      response: QuotationResponse.Approved,
    });
    expect(approve.status).toBe(200);
    const { tech } = await seedTechnicianAndLogin();
    return { ...base, tech };
  };

  test('converts an approved quote — snapshots inherited, quote flipped, both timelines written', async () => {
    const { token, quote, service, customer, tech } = await approvedScenario({
      price: 1500,
      quantity: '2',
    });

    // Between approval and conversion the catalog moves on: the service is
    // soft-deleted outright. The direct order path would refuse it (422); the
    // quote path must honor it — the client accepted THIS price for THIS
    // service, and the order inherits the frozen snapshot, never the catalog.
    const del = await request(`/services/${service.id}`, {
      method: 'DELETE',
      headers: jsonHeaders(token),
      body: JSON.stringify({ deleteComment: 'retirado tras cotizar' }),
    });
    expect(del.status).toBe(200);

    // Office converts: with ≥1 approval the gate admits any staff role (20 §7).
    const { token: officeToken } = await seedOfficeAndLogin();
    const res = await convert(officeToken, quote.id, {
      comment: 'Cliente confirmó por teléfono',
      location: 'Planta norte',
      assignments: [assignmentFor(service.id, tech.id)],
    });
    expect(res.status).toBe(201);
    const { order } = await json<{ order: OrderDetail }>(res);
    convertedOrders.push(order.id);

    expect(order.folio).toMatch(/^OS-\d{8}-\d{4}$/);
    expect(order.quotationId).toBe(quote.id);
    expect(order.customerId).toBe(customer.id);
    expect(order.location).toBe('Planta norte');
    expect(order.servicesCount).toBe(1);
    // The frozen snapshot, not the (now tombstoned) catalog row.
    expect(order.lines[0]!.serviceName).toBe(service.name);
    expect(order.lines[0]!.unitPrice).toBe('1500.00');
    expect(order.lines[0]!.quantity).toBe(2);
    expect(order.amounts).toEqual({ subtotal: '3000.00', tax: '480.00', total: '3480.00' });

    // One pending report per unit, born assigned.
    const reportsRes = await request(`/service-orders/${order.id}/reports`, {
      headers: jsonHeaders(officeToken),
    });
    expect(reportsRes.status).toBe(200);
    const exploded = (await json<{ reports: { status: string; assignedTo: string }[] }>(reportsRes))
      .reports;
    expect(exploded).toHaveLength(2);
    expect(exploded.every((r) => r.status === 'pending' && r.assignedTo === tech.id)).toBe(true);

    // The quote is terminal and points at its order, with the mandatory why.
    const quoteRes = await request(`/quotations/${quote.id}`, { headers: jsonHeaders(token) });
    const after = await json<Quotation>(quoteRes);
    expect(after.status).toBe(QuotationStatus.OrderCreated);
    expect(after.serviceOrderId).toBe(order.id);
    expect(after.resolutionReason).toBe('Cliente confirmó por teléfono');

    // Pre-sale timeline: quotation_order_created, ref → the order, no override.
    const qEvents = await json<TimelineEvent[]>(
      await request(`/quotations/${quote.id}/timeline`, { headers: jsonHeaders(token) }),
    );
    const converted = qEvents.find((e) => e.type === QuotationEventType.OrderCreated);
    expect(converted).toBeDefined();
    expect(converted!.note).toBe('Cliente confirmó por teléfono');
    expect(converted!.changes).toMatchObject({ approvedCount: 1, override: false });

    // Post-sale timeline: the order opens referencing the quotation.
    const oEvents = await json<{ items: { type: string; ref?: { kind: string; id: string } }[] }>(
      await request(`/service-orders/${order.id}/timeline?limit=50`, {
        headers: jsonHeaders(officeToken),
      }),
    );
    const opening = oEvents.items.find((e) => e.type === 'order_created');
    expect(opening!.ref).toEqual({ kind: 'quotation', id: quote.id });
  });

  test('merges duplicate-service quote lines; owner override at 0 approvals is flagged', async () => {
    // A quote with two lines for the SAME service (different description) —
    // legal on a quote, one merged line on the order.
    const { token: ownerToken } = await seedOwnerAndLogin();
    const customer = await seedCustomer();
    const service = await makeService(ownerToken, { price: 200 });
    const res = await createQuote(ownerToken, {
      customerId: customer.id,
      validUntil: dayOffset(10),
      lines: [
        { serviceId: service.id, quantity: '1', description: 'Turno matutino' },
        { serviceId: service.id, quantity: '2', description: 'Turno vespertino' },
      ],
    });
    expect(res.status).toBe(201);
    const dupQuote = await json<Quotation>(res);
    created.push(dupQuote.id);

    const { tech } = await seedTechnicianAndLogin();

    // Office may NOT convert a quote with zero approvals (20 §7)…
    const { token: officeToken } = await seedOfficeAndLogin();
    const denied = await convert(officeToken, dupQuote.id, {
      comment: 'sin aprobación',
      assignments: [assignmentFor(service.id, tech.id)],
    });
    expect(denied.status).toBe(403);
    expect((await json<{ error: string }>(denied)).error).toBe('approval_required');

    // …but the owner can override, and the trail says so.
    const converted = await convert(ownerToken, dupQuote.id, {
      comment: 'Se procede sin revisión del cliente',
      assignments: [assignmentFor(service.id, tech.id)],
    });
    expect(converted.status).toBe(201);
    const { order } = await json<{ order: OrderDetail }>(converted);
    convertedOrders.push(order.id);

    expect(order.lines).toHaveLength(1);
    expect(order.lines[0]!.quantity).toBe(3);
    expect(order.amounts?.subtotal).toBe('600.00');

    const qEvents = await json<TimelineEvent[]>(
      await request(`/quotations/${dupQuote.id}/timeline`, { headers: jsonHeaders(ownerToken) }),
    );
    const evt = qEvents.find((e) => e.type === QuotationEventType.OrderCreated);
    expect(evt!.changes).toMatchObject({ approvedCount: 0, override: true });
  });

  test('rejects an expired quote with 409', async () => {
    const { token: ownerToken } = await seedOwnerAndLogin();
    const customer = await seedCustomer();
    const service = await makeService(ownerToken);
    const res = await createQuote(ownerToken, {
      customerId: customer.id,
      validUntil: dayOffset(-1),
      lines: [{ serviceId: service.id, quantity: '1' }],
    });
    const stale = await json<Quotation>(res);
    created.push(stale.id);
    const { tech } = await seedTechnicianAndLogin();

    const denied = await convert(ownerToken, stale.id, {
      comment: 'tarde',
      assignments: [assignmentFor(service.id, tech.id)],
    });
    expect(denied.status).toBe(409);
    expect((await json<{ error: string }>(denied)).error).toBe('quotation_expired');
  });

  test('a quote converts exactly once — the second attempt 409s', async () => {
    const { token, quote, service, tech } = await approvedScenario();
    const first = await convert(token, quote.id, {
      comment: 'ok',
      assignments: [assignmentFor(service.id, tech.id)],
    });
    expect(first.status).toBe(201);
    convertedOrders.push((await json<{ order: OrderDetail }>(first)).order.id);

    const second = await convert(token, quote.id, {
      comment: 'otra vez',
      assignments: [assignmentFor(service.id, tech.id)],
    });
    expect(second.status).toBe(409);
    expect((await json<{ error: string }>(second)).error).toBe('quotation_not_live');
  });

  test('assignments must cover the quoted services exactly', async () => {
    const { token, quote, tech } = await approvedScenario();
    // An assignment for a service the quote never carried → both defects named.
    const denied = await convert(token, quote.id, {
      comment: 'mal armado',
      assignments: [assignmentFor('00000000-0000-4000-8000-000000000000', tech.id)],
    });
    expect(denied.status).toBe(422);
    const body = await json<{ error: string; missing: string[]; unknown: string[] }>(denied);
    expect(body.error).toBe('assignment_coverage');
    expect(body.missing).toHaveLength(1);
    expect(body.unknown).toEqual(['00000000-0000-4000-8000-000000000000']);
  });

  test('404s a malformed quotation id', async () => {
    const { token } = await seedOwnerAndLogin();
    const res = await convert(token, 'not-a-uuid', {
      comment: 'x',
      assignments: [assignmentFor('00000000-0000-4000-8000-000000000000', '00000000-0000-4000-8000-000000000001')],
    });
    expect(res.status).toBe(404);
  });
});

describe('quotations — customer-scoped list (20 §9)', () => {
  test("returns only that client's quotes", async () => {
    const { quote, customer, token, service } = await scenario();
    // A second client with its own quote, to prove the scoping actually filters
    // rather than the assertion passing because there is nothing else to see.
    const other = await seedCustomer();
    const otherRes = await createQuote(token, {
      customerId: other.id,
      validUntil: dayOffset(15),
      lines: [{ serviceId: service.id, quantity: '1' }],
    });
    expect(otherRes.status).toBe(201);
    const otherQuote = await json<Quotation>(otherRes);
    created.push(otherQuote.id);

    const res = await request(`/customers/${customer.id}/quotations`, {
      headers: jsonHeaders(token),
    });
    expect(res.status).toBe(200);
    const page = await json<{ items: Quotation[]; total: number }>(res);
    const ids = page.items.map((q) => q.id);
    expect(ids).toContain(quote.id);
    expect(ids).not.toContain(otherQuote.id);
    expect(page.items.every((q) => q.customerId === customer.id)).toBe(true);
  });

  test('404s on an unknown client rather than returning an empty page', async () => {
    const { token } = await seedOwnerAndLogin();
    const res = await request('/customers/00000000-0000-4000-8000-000000000000/quotations', {
      headers: jsonHeaders(token),
    });
    expect(res.status).toBe(404);
  });

  test('is closed to technicians and to anonymous callers', async () => {
    const { customer } = await scenario();
    const { token: techToken } = await seedTechnicianAndLogin();

    expect((await request(`/customers/${customer.id}/quotations`)).status).toBe(401);
    expect(
      (await request(`/customers/${customer.id}/quotations`, { headers: jsonHeaders(techToken) }))
        .status,
    ).toBe(403);
  });
});

describe('quotations — line model v2 (20 CP-3 PR-A)', () => {
  test('a decimal quantity rounds the importe once, half-up, per line', async () => {
    const { token } = await seedOwnerAndLogin();
    const customer = await seedCustomer();
    const service = await makeService(token, { price: 333.33 });
    const res = await createQuote(token, {
      customerId: customer.id,
      validUntil: dayOffset(10),
      lines: [{ serviceId: service.id, quantity: '1.5' }],
    });
    expect(res.status).toBe(201);
    const quote = await json<Quotation>(res);
    created.push(quote.id);
    // 333.33 × 1.5 = 499.995 → one half-up rounding to 500.00, THEN the IVA —
    // never a float in between (the drift this suite exists to forbid).
    expect(quote.lines[0]?.quantity).toBe('1.500');
    expect(quote.lines[0]?.lineSubtotal).toBe('500.00');
    expect(quote.totals).toEqual({
      subtotal: '500.00',
      discount: '0.00',
      iva: '80.00',
      total: '580.00',
    });
  });

  test('an off-catalog line freezes the staff-typed snapshot with no serviceId', async () => {
    const { token } = await seedOwnerAndLogin();
    const customer = await seedCustomer();
    const res = await createQuote(token, {
      customerId: customer.id,
      validUntil: dayOffset(10),
      lines: [
        {
          name: 'Grúa para izaje (renta por evento)',
          unitPrice: '4500.00',
          uom: ServiceUom.Servicio,
          taxRate: ServiceTaxRate.Iva16,
          quantity: '1',
          description: 'Concepto único, fuera de catálogo',
        },
      ],
    });
    expect(res.status).toBe(201);
    const quote = await json<Quotation>(res);
    created.push(quote.id);
    const [line] = quote.lines;
    expect(line?.serviceId).toBeUndefined();
    expect(line?.serviceName).toBe('Grúa para izaje (renta por evento)');
    expect(line?.unitPrice).toBe('4500.00');
    expect(quote.totals.total).toBe('5220.00');
  });

  test('an off-catalog line missing its snapshot fields is rejected', async () => {
    const { token } = await seedOwnerAndLogin();
    const customer = await seedCustomer();
    const res = await createQuote(token, {
      customerId: customer.id,
      validUntil: dayOffset(10),
      lines: [{ name: 'Sin precio', quantity: '1' }],
    });
    expect(res.status).toBe(400);
  });

  test('a per-line discount lowers the IVA base; subtotal keeps the pre-discount importe', async () => {
    const { token } = await seedOwnerAndLogin();
    const customer = await seedCustomer();
    const service = await makeService(token, { price: 1000 });
    const res = await createQuote(token, {
      customerId: customer.id,
      validUntil: dayOffset(10),
      lines: [{ serviceId: service.id, quantity: '1', discountAmount: '100.00' }],
    });
    expect(res.status).toBe(201);
    const quote = await json<Quotation>(res);
    created.push(quote.id);
    // CFDI shape: SubTotal 1000 (pre-discount), Descuento 100, IVA on the net
    // base 900 @16% = 144, Total 1044.
    expect(quote.lines[0]?.discountAmount).toBe('100.00');
    expect(quote.totals).toEqual({
      subtotal: '1000.00',
      discount: '100.00',
      iva: '144.00',
      total: '1044.00',
    });
  });

  test('a discount above the line importe is a 400 naming the line', async () => {
    const { token } = await seedOwnerAndLogin();
    const customer = await seedCustomer();
    const service = await makeService(token, { price: 1000 });
    const res = await createQuote(token, {
      customerId: customer.id,
      validUntil: dayOffset(10),
      lines: [{ serviceId: service.id, quantity: '1', discountAmount: '1200.00' }],
    });
    expect(res.status).toBe(400);
    const body = await json<{ error: string; serviceName: string }>(res);
    expect(body.error).toBe('discount_too_large');
    expect(body.serviceName).toBeTruthy();
  });
});

describe('quotations — line model v2 vs the convergence (20 CP-3 PR-A)', () => {
  test('a discounted quote refuses conversion until orders learn line model v2', async () => {
    const { token } = await seedOwnerAndLogin();
    const customer = await seedCustomer();
    const service = await makeService(token, { price: 1000 });
    const res = await createQuote(token, {
      customerId: customer.id,
      validUntil: dayOffset(10),
      lines: [{ serviceId: service.id, quantity: '1', discountAmount: '100.00' }],
    });
    expect(res.status).toBe(201);
    const quote = await json<Quotation>(res);
    created.push(quote.id);
    const { tech } = await seedTechnicianAndLogin();

    // Owner + draft = the approval override admits them; the LINE is what
    // refuses — an order line carries no discount, and converting would
    // silently charge the pre-discount price.
    const denied = await post(token, `/quotations/${quote.id}/order`, {
      comment: 'conversión directa',
      assignments: [{ serviceId: service.id, technicianId: tech.id, reportType: 'minisplit' }],
    });
    expect(denied.status).toBe(409);
    expect((await json<{ error: string }>(denied)).error).toBe('quotation_line_not_convertible');
  });
});

describe('quotations — approval page + PDF (20 CP-3 PR-B)', () => {
  test('a browser gets the approval page on the same route; API callers keep the JSON', async () => {
    const { quote, token, contact } = await scenario();
    const { tokenFor } = await sendAndGetTokens(token, quote.id, [
      { contactId: contact.id, isReviewer: true },
    ]);
    const t = tokenFor(contact.id);

    const html = await request(`/public/quotations/${t}`, { headers: { accept: 'text/html' } });
    expect(html.status).toBe(200);
    expect(html.headers.get('content-type')).toContain('text/html');
    const page = await html.text();
    expect(page).toContain(quote.folio);
    // A reviewer on a live quote gets the form…
    expect(page).toContain('Aprobar');

    // …and the CP-1 JSON contract survives on the same URL.
    const asJson = await json<PublicView>(await request(`/public/quotations/${t}`));
    expect(asJson.folio).toBe(quote.folio);
  });

  test('the form path records a response and redirects (PRG); a decline without reason bounces', async () => {
    const { quote, token, contact } = await scenario();
    const { tokenFor } = await sendAndGetTokens(token, quote.id, [
      { contactId: contact.id, isReviewer: true },
    ]);
    const t = tokenFor(contact.id);
    const form = (fields: Record<string, string>) =>
      request(`/public/quotations/${t}/respond`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields).toString(),
      });

    const missing = await form({ response: QuotationResponse.Declined });
    expect(missing.status).toBe(303);
    expect(missing.headers.get('location')).toContain('e=reason_required');

    const ok = await form({ response: QuotationResponse.Approved });
    expect(ok.status).toBe(303);
    const after = await json<PublicView>(await request(`/public/quotations/${t}`));
    expect(after.viewer.response).toBe(QuotationResponse.Approved);
  });

  test('sends attach the cotización PDF and the token serves the same document', async () => {
    const { quote, token, contact } = await scenario({ price: 1500, quantity: '2' });
    const { tokenFor } = await sendAndGetTokens(token, quote.id, [
      { contactId: contact.id, isReviewer: true },
    ]);

    // The mailed payload carries the document, not just the link (20 §4).
    const mailed = allResendSends().find((s) => s.subject.includes(quote.folio));
    expect(mailed?.attachments?.[0]?.filename).toBe(`${quote.folio}.pdf`);
    expect((mailed?.attachments?.[0]?.content ?? '').length).toBeGreaterThan(1000);

    const res = await request(`/public/quotations/${tokenFor(contact.id)}/pdf`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');
  });
});

import { describe, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { env, json, jsonHeaders, request } from './helpers/request';
import { uniqueRecipientEmail } from './helpers/fixtures';
import { mockTurnstile, setTurnstileVerdict } from './helpers/turnstile';
import { createDb } from '../src/modules/database/client';
import { customerInteractions, customers } from '../src/modules/database/schema';
import {
  findCustomerById,
  findCustomerWithRelations,
} from '../src/modules/customers/repository/customers.repository';
import { LEAD_COOKIE_NAME } from '../src/modules/customers/constants/lead-cookie';

type WorkerEnv = { DATABASE_URL: string; LEADS_RATE_LIMITER?: unknown };

const db = () => createDb((env as unknown as WorkerEnv).DATABASE_URL);

mockTurnstile();

// No auth header anywhere in this file — the endpoint is public by design.
const postLead = (payload: Record<string, unknown>, headers: Record<string, string> = {}) =>
  request('/public/leads', {
    method: 'POST',
    headers: { ...jsonHeaders(), ...headers },
    body: JSON.stringify(payload),
  });

const leadPayload = (overrides: Record<string, unknown> = {}) => ({
  firstName: 'Ana',
  lastName: 'García',
  email: uniqueRecipientEmail('lead'),
  clientType: 'person',
  turnstileToken: 'tok-test',
  ...overrides,
});

const rowsByEmail = (email: string) =>
  db().select().from(customers).where(eq(customers.email, email));

const interactionsOf = (customerId: string) =>
  db()
    .select()
    .from(customerInteractions)
    .where(eq(customerInteractions.customerId, customerId));

describe('POST /public/leads', () => {
  test('person lead with facebook attribution → 201, lead row carries every attribution column', async () => {
    const payload = leadPayload({
      comments: 'Necesito mantenimiento de chiller',
      utmSource: 'facebook',
      utmMedium: 'social',
      utmCampaign: 'verano-2026',
      utmTerm: 'renta chiller',
      utmContent: 'ad-1',
      gclid: 'g-123',
      fbclid: 'fb-456',
      referrer: 'https://www.facebook.com/',
      landingPage: '/contact-us?utm_source=facebook',
    });
    const res = await postLead(payload);
    expect(res.status).toBe(201);
    const body = await json<{ id: string }>(res);
    // Success responds with the id only — no row echo on a public endpoint.
    expect(Object.keys(body)).toEqual(['id']);

    const row = await findCustomerById(db(), body.id);
    expect(row).not.toBeNull();
    expect(row?.status).toBe('lead');
    expect(row?.source).toBe('facebook');
    expect(row?.clientType).toBe('person');
    expect(row?.name).toBe('Ana García');
    expect(row?.contactName).toBe('Ana García');
    expect(row?.observation).toBe('Necesito mantenimiento de chiller');
    expect(row?.utmSource).toBe('facebook');
    expect(row?.utmMedium).toBe('social');
    expect(row?.utmCampaign).toBe('verano-2026');
    expect(row?.utmTerm).toBe('renta chiller');
    expect(row?.utmContent).toBe('ad-1');
    expect(row?.gclid).toBe('g-123');
    expect(row?.fbclid).toBe('fb-456');
    expect(row?.referrer).toBe('https://www.facebook.com/');
    expect(row?.landingPage).toBe('/contact-us?utm_source=facebook');

    // Birth timeline entry: actor-less system entry saying where the lead came from.
    const timeline = await interactionsOf(body.id);
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      type: 'system',
      userId: null,
      body: 'Lead creado desde el sitio web · Origen: Facebook · Campaña: verano-2026',
    });
  });

  test('business lead → name is the business, contact person becomes the default contact', async () => {
    const payload = leadPayload({
      clientType: 'business',
      businessName: 'Frío Industrial SA de CV',
      comments: 'Cotización anual',
    });
    const res = await postLead(payload);
    expect(res.status).toBe(201);
    const { id } = await json<{ id: string }>(res);
    const row = await findCustomerWithRelations(db(), id);
    expect(row?.name).toBe('Frío Industrial SA de CV');
    expect(row?.clientType).toBe('business');
    expect(row?.contactName).toBe('Ana García');
    expect(row?.observation).toBe('Cotización anual');
    expect(row?.contacts).toHaveLength(1);
    expect(row?.contacts[0]).toMatchObject({ name: 'Ana García', isDefault: true });
  });

  test('business lead without businessName → 400 validation_error', async () => {
    const res = await postLead(leadPayload({ clientType: 'business' }));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: 'validation_error' });
  });

  test('unknown utmSource → source falls back to website (utm value still stored)', async () => {
    const res = await postLead(leadPayload({ utmSource: 'billboard-x' }));
    expect(res.status).toBe(201);
    const { id } = await json<{ id: string }>(res);
    const row = await findCustomerById(db(), id);
    expect(row?.source).toBe('website');
    expect(row?.utmSource).toBe('billboard-x');
    // The unmapped raw value survives in the timeline body, not just the column.
    const timeline = await interactionsOf(id);
    expect(timeline[0]?.body).toBe(
      'Lead creado desde el sitio web · Origen: Sitio web (utm: billboard-x)',
    );
  });

  test('absent utmSource → source website, attribution columns stay null', async () => {
    const res = await postLead(leadPayload());
    expect(res.status).toBe(201);
    const { id } = await json<{ id: string }>(res);
    const row = await findCustomerById(db(), id);
    expect(row?.source).toBe('website');
    expect(row?.utmSource).toBeNull();
    expect(row?.referrer).toBeNull();
  });

  test('phone-only lead (no email) passes the at-least-one rule', async () => {
    const res = await postLead(leadPayload({ email: undefined, phone: '+52 81 1234 5678' }));
    expect(res.status).toBe(201);
  });

  test('missing email and phone → 400', async () => {
    const res = await postLead(leadPayload({ email: undefined }));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: 'validation_error' });
  });

  test('missing clientType → 400', async () => {
    const res = await postLead(leadPayload({ clientType: undefined }));
    expect(res.status).toBe(400);
  });

  test('turnstile fail → 403 turnstile_failed, no row inserted', async () => {
    setTurnstileVerdict(false);
    const email = uniqueRecipientEmail('lead-turnstile-fail');
    const res = await postLead(leadPayload({ email }));
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ error: 'turnstile_failed' });
    expect(await rowsByEmail(email)).toHaveLength(0);
  });

  test('script tags in utmCampaign are sanitized, lead still inserts', async () => {
    const res = await postLead(leadPayload({ utmCampaign: '<script>alert(1)</script>' }));
    expect(res.status).toBe(201);
    const { id } = await json<{ id: string }>(res);
    const row = await findCustomerById(db(), id);
    expect(row?.utmCampaign).toBe('scriptalert(1)/script');
  });

  test('javascript: referrer is dropped, lead still inserts', async () => {
    const res = await postLead(leadPayload({ referrer: 'javascript:alert(1)' }));
    expect(res.status).toBe(201);
    const { id } = await json<{ id: string }>(res);
    const row = await findCustomerById(db(), id);
    expect(row?.referrer).toBeNull();
  });

  test('dedup cookie present → 429 already_submitted, no row inserted', async () => {
    const email = uniqueRecipientEmail('lead-cookie');
    const res = await postLead(leadPayload({ email }), { cookie: `${LEAD_COOKIE_NAME}=1` });
    expect(res.status).toBe(429);
    expect(await json(res)).toEqual({ error: 'already_submitted' });
    expect(await rowsByEmail(email)).toHaveLength(0);
  });

  test('successful submit sets the dedup cookie', async () => {
    const res = await postLead(leadPayload());
    expect(res.status).toBe(201);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${LEAD_COOKIE_NAME}=1`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=None');
  });

  // Needs the LEADS_RATE_LIMITER binding — skipped automatically if the test
  // pool doesn't materialize unsafe ratelimit bindings.
  test.runIf(Boolean((env as unknown as WorkerEnv).LEADS_RATE_LIMITER))(
    'second request from the same IP inside a minute → 429 rate_limited',
    async () => {
      const ip = '203.0.113.77';
      const first = await postLead(leadPayload(), { 'cf-connecting-ip': ip });
      expect(first.status).toBe(201);
      const second = await postLead(leadPayload(), { 'cf-connecting-ip': ip });
      expect(second.status).toBe(429);
      expect(await json(second)).toEqual({ error: 'rate_limited' });
    },
  );
});

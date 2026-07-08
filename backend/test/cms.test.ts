import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { authHeader, env, json, jsonHeaders, request } from './helpers/request';
import { seedAdminAndLogin, seedOwnerAndLogin, seedTechnicianAndLogin } from './helpers/fixtures';
import { createDb } from '../src/modules/database/client';
import { cmsClients, cmsDocuments } from '../src/modules/database/schema';

type WorkerEnv = { DATABASE_URL: string; CDN_BASE_URL: string };

const workerEnv = env as unknown as WorkerEnv;
const db = () => createDb(workerEnv.DATABASE_URL);

// The CMS tables are per-tenant singletons (one home doc, one clients set), so
// unlike the other suites these tests can't isolate by fixture email. Instead
// we snapshot whatever the tables hold, run against a clean slate, and restore
// the snapshot afterwards.
let savedDocuments: (typeof cmsDocuments.$inferSelect)[] = [];
let savedClients: (typeof cmsClients.$inferSelect)[] = [];

beforeAll(async () => {
  const d = db();
  savedDocuments = await d.select().from(cmsDocuments);
  savedClients = await d.select().from(cmsClients);
  await d.delete(cmsClients);
  await d.delete(cmsDocuments);
});

afterAll(async () => {
  const d = db();
  await d.delete(cmsClients);
  await d.delete(cmsDocuments);
  if (savedDocuments.length) await d.insert(cmsDocuments).values(savedDocuments);
  if (savedClients.length) await d.insert(cmsClients).values(savedClients);
});

const HOME_DOC = {
  title: 'Climatización industrial para',
  description: 'Mantenimiento, renta y venta de chillers.',
  hero_video_url: 'https://cdn.example.com/hero.mp4',
  service_targets: ['plantas'],
  badges: [{ label: 'instalaciones', value: '+120', unit: 'equipos' }],
  services_content: { eyebrow: 'Servicios', title: 'Lo que hacemos', description: 'Chillers y más.' },
  services: [{ title: 'Mantenimiento', description: 'Preventivo.', tags: ['24/7'], icon: 'wrench' }],
  service_area: 'Noreste de México',
  contact_cta: { title: 'Cotiza hoy', description: 'Respuesta en 24 horas.' },
  clients_content: {
    eyebrow: 'Clientes',
    title: 'Construyendo confianza',
    description: 'Empresas que confían en nosotros.',
    cta_title: '¿Nuestro próximo proyecto?',
    cta_description: 'Te contactamos en 24 horas.',
  },
  manufacturers_content: { eyebrow: 'Marcas', title: 'Marcas líderes', description: 'Equipos originales.' },
  // logoUrl is an editor echo — the backend must strip it and materialize its own.
  manufacturers: [{ name: 'Carrier', logoKey: 'cms/carrier.png', logoUrl: 'https://evil.example.com/spoof.png' }],
  location_content: { eyebrow: 'Ubicación', title: 'Corredor industrial', description: 'Desde NL.', schedule: 'Lun a vie, 8:00 – 18:00' },
};

type HomeEnvelope = {
  data: typeof HOME_DOC & { manufacturers?: { name: string; logoKey?: string; logoUrl?: string }[] };
  unpublishedChanges: boolean;
};

type ClientDto = {
  id: string;
  name: string;
  sector?: string;
  logoKey?: string;
  logoUrl?: string;
  businessRelationDescription?: string;
};

describe('cms module', () => {
  test('auth gates: 401 without token, 403 for technician, owner allowed, publics stay open', async () => {
    expect((await request('/cms/home')).status).toBe(401);
    const { token } = await seedTechnicianAndLogin();
    expect((await request('/cms/home', { headers: authHeader(token) })).status).toBe(403);
    expect((await request('/cms/clients', { headers: authHeader(token) })).status).toBe(403);
    // owner passes the gate alongside admin
    const { token: ownerToken } = await seedOwnerAndLogin();
    expect((await request('/cms/home', { headers: authHeader(ownerToken) })).status).toBe(200);
    expect((await request('/cms/clients', { headers: authHeader(ownerToken) })).status).toBe(200);
    // nothing published yet → public routes 404 (website falls back to defaults)
    expect((await request('/public/cms/home')).status).toBe(404);
    expect((await request('/public/cms/clients')).status).toBe(404);
  });

  test('home: empty default → 409 publish → draft save → publish → public read', async () => {
    const { token } = await seedAdminAndLogin();

    // Never-saved tenant gets a well-formed empty draft.
    let res = await request('/cms/home', { headers: authHeader(token) });
    expect(res.status).toBe(200);
    let envelope = await json<HomeEnvelope>(res);
    expect(envelope.data.title).toBe('');
    expect(envelope.unpublishedChanges).toBe(false);

    // Publishing before any save is a 409.
    res = await request('/cms/home/publish', { method: 'POST', headers: jsonHeaders(token), body: '{}' });
    expect(res.status).toBe(409);
    expect((await json<{ error: string }>(res)).error).toBe('nothing_to_publish');

    // Icon codes outside the curated 12 are rejected.
    res = await request('/cms/home', {
      method: 'PUT',
      headers: jsonHeaders(token),
      body: JSON.stringify({
        ...HOME_DOC,
        services: [{ title: 'X', description: 'Y', tags: [], icon: 'skull' }],
      }),
    });
    expect(res.status).toBe(400);

    // Valid save: draft stored, manufacturers logoUrl re-materialized from the key.
    res = await request('/cms/home', {
      method: 'PUT',
      headers: jsonHeaders(token),
      body: JSON.stringify(HOME_DOC),
    });
    expect(res.status).toBe(200);
    envelope = await json<HomeEnvelope>(res);
    expect(envelope.unpublishedChanges).toBe(true);
    expect(envelope.data.manufacturers?.[0]?.logoUrl).toBe(
      `${workerEnv.CDN_BASE_URL}/cms/carrier.png`,
    );

    // Draft persists; public stays 404 until publish.
    envelope = await json<HomeEnvelope>(await request('/cms/home', { headers: authHeader(token) }));
    expect(envelope.data.title).toBe(HOME_DOC.title);
    expect(envelope.data.location_content?.schedule).toBe(HOME_DOC.location_content.schedule);
    expect(envelope.unpublishedChanges).toBe(true);
    expect((await request('/public/cms/home')).status).toBe(404);

    // Publish → badge clears, public serves the doc (spoofed logoUrl never stored).
    res = await request('/cms/home/publish', { method: 'POST', headers: jsonHeaders(token), body: '{}' });
    expect(res.status).toBe(200);
    envelope = await json<HomeEnvelope>(await request('/cms/home', { headers: authHeader(token) }));
    expect(envelope.unpublishedChanges).toBe(false);

    const pub = await request('/public/cms/home');
    expect(pub.status).toBe(200);
    const doc = await json<HomeEnvelope['data']>(pub);
    expect(doc.title).toBe(HOME_DOC.title);
    expect(doc.hero_video_url).toBe(HOME_DOC.hero_video_url);
    expect(doc.services[0]?.icon).toBe('wrench');
    expect(doc.manufacturers?.[0]?.logoUrl).toBe(`${workerEnv.CDN_BASE_URL}/cms/carrier.png`);
    expect(JSON.stringify(doc)).not.toContain('evil.example.com');
  });

  test('clients: sanitized CRUD → publish snapshot → public shape', async () => {
    const { token } = await seedAdminAndLogin();

    // Empty set, nothing pending.
    let listRes = await request('/cms/clients', { headers: authHeader(token) });
    let list = await json<{ data: ClientDto[]; unpublishedChanges: boolean }>(listRes);
    expect(list.data).toEqual([]);
    expect(list.unpublishedChanges).toBe(false);

    // Create: HTML is sanitized on write (whitelist tags, attributes dropped).
    const createRes = await request('/cms/clients', {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify({
        name: 'Aceros del Norte',
        sector: 'Metalurgia',
        logoKey: 'cms/aceros.png',
        businessRelationDescription:
          '<script>alert(1)</script><b onclick="hack()">Cliente desde <i>2019</i></b>',
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await json<ClientDto>(createRes);
    expect(created.businessRelationDescription).toBe('alert(1)<b>Cliente desde <i>2019</i></b>');
    expect(created.logoUrl).toBe(`${workerEnv.CDN_BASE_URL}/cms/aceros.png`);

    list = await json(await request('/cms/clients', { headers: authHeader(token) }));
    expect(list.data).toHaveLength(1);
    expect(list.unpublishedChanges).toBe(true);
    expect((await request('/public/cms/clients')).status).toBe(404);

    // Publish → public array, entry shape has no id/logoKey.
    expect(
      (await request('/cms/clients/publish', { method: 'POST', headers: jsonHeaders(token), body: '{}' })).status,
    ).toBe(200);
    list = await json(await request('/cms/clients', { headers: authHeader(token) }));
    expect(list.unpublishedChanges).toBe(false);

    const pub = await request('/public/cms/clients');
    expect(pub.status).toBe(200);
    const entries = await json<Record<string, unknown>[]>(pub);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.name).toBe('Aceros del Norte');
    expect(entries[0]?.logoUrl).toBe(`${workerEnv.CDN_BASE_URL}/cms/aceros.png`);
    expect(entries[0]).not.toHaveProperty('id');
    expect(entries[0]).not.toHaveProperty('logoKey');

    // Edit re-sanitizes and re-flags unpublished; the published copy is untouched.
    const patchRes = await request(`/cms/clients/${created.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(token),
      body: JSON.stringify({ businessRelationDescription: '<u>subrayado</u> plano' }),
    });
    expect(patchRes.status).toBe(200);
    const patched = await json<ClientDto>(patchRes);
    expect(patched.businessRelationDescription).toBe('subrayado plano');
    list = await json(await request('/cms/clients', { headers: authHeader(token) }));
    expect(list.unpublishedChanges).toBe(true);

    // Unknown / malformed ids 404 cleanly.
    expect(
      (
        await request('/cms/clients/00000000-0000-4000-8000-000000000000', {
          method: 'PATCH',
          headers: jsonHeaders(token),
          body: JSON.stringify({ name: 'X' }),
        })
      ).status,
    ).toBe(404);
    expect(
      (await request('/cms/clients/not-a-uuid', { method: 'DELETE', headers: jsonHeaders(token) })).status,
    ).toBe(404);

    // Delete leaves the published snapshot serving until the next publish.
    expect(
      (await request(`/cms/clients/${created.id}`, { method: 'DELETE', headers: jsonHeaders(token) })).status,
    ).toBe(200);
    list = await json(await request('/cms/clients', { headers: authHeader(token) }));
    expect(list.data).toEqual([]);
    expect(list.unpublishedChanges).toBe(true);
    expect(await json<unknown[]>(await request('/public/cms/clients'))).toHaveLength(1);
  });

  test('publish rejects unknown sections', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/cms/nope/publish', {
      method: 'POST',
      headers: jsonHeaders(token),
      body: '{}',
    });
    expect(res.status).toBe(404);
  });
});

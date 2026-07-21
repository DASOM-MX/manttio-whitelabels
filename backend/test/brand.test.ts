import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import UPNG from 'upng-js';
import { app } from '../src/index';
import { authHeader, env, json, jsonHeaders, request } from './helpers/request';
import { seedAdminAndLogin, seedOwnerAndLogin } from './helpers/fixtures';
import { createDb } from '../src/modules/database/client';
import { brand } from '../src/modules/database/schema';
import { BRAND_SCALE_STEPS } from '../src/modules/brand/constants/scale-steps';
import type { Brand, FontCatalogEntry } from '../src/modules/brand/dtos/brand.dto';

type WorkerEnv = { DATABASE_URL: string; CDN_BASE_URL: string; LOGOS_CDN_BASE_URL: string };

const workerEnv = env as unknown as WorkerEnv;
const db = () => createDb(workerEnv.DATABASE_URL);

// Like the CMS suite, the brand table is a per-tenant singleton — no fixture
// isolation by email. Snapshot whatever the row holds, run clean, restore.
let savedBrand: (typeof brand.$inferSelect)[] = [];

beforeAll(async () => {
  const d = db();
  savedBrand = await d.select().from(brand);
  await d.delete(brand);
});

afterAll(async () => {
  const d = db();
  await d.delete(brand);
  if (savedBrand.length) await d.insert(brand).values(savedBrand);
});

// A materialized HSL 0…1000 scale (the editor's job — stored verbatim).
const hslScale = (hue: number) =>
  Object.fromEntries(
    BRAND_SCALE_STEPS.map((step, i) => [step, `${hue} 20% ${98 - i * 8}%`]),
  );

const SAVE_BODY = {
  name: 'Acme Chillers',
  slogan: 'Frío confiable',
  siteUrl: 'https://acme.example.com',
  logoKey: 'brand/acme-logo.png',
  colors: { primary: hslScale(210), surface: hslScale(0) },
  contact: { email: 'hola@acme.example.com' },
  social: { facebook: 'https://facebook.com/acme' },
  font: { body: 'work_sans', heading: 'rubik' },
};

const MANAGER_TOKEN = 'test-manager-token';

// The shared secret is injected per-request so the suite doesn't depend on a
// MANAGER_SHARED_TOKEN entry in .dev.vars.
const managerRequest = (path: string, init?: Parameters<typeof app.request>[1], secret?: string) =>
  app.request(path, init, {
    ...(env as unknown as Record<string, unknown>),
    MANAGER_SHARED_TOKEN: secret ?? '',
  });

describe('brand module', () => {
  test('GET /brand is public and serves the neutral default until a row exists', async () => {
    const res = await request('/brand');
    expect(res.status).toBe(200);
    const body = await json<Brand>(res);
    expect(body.name).toBe('');
    expect(body.logoUrl).toBeUndefined();
    for (const step of BRAND_SCALE_STEPS) {
      expect(body.colors.primary[step]).toMatch(/^\d+ \d+% \d+%$/);
      expect(body.colors.surface[step]).toMatch(/^\d+ \d+% \d+%$/);
    }
  });

  test('GET /fonts is public and serves the curated catalog', async () => {
    const res = await request('/fonts');
    expect(res.status).toBe(200);
    const catalog = await json<FontCatalogEntry[]>(res);
    expect(catalog.length).toBe(10);
    const workSans = catalog.find((f) => f.code === 'work_sans');
    expect(workSans?.label).toBe('Work Sans');
    // FONT_CDN_BASE_URL is unset in tests → entries ship without files.
    expect(workSans?.files.variable).toBeUndefined();
  });

  test('PUT /brand gates: 401 without auth, 403 for admin, owner passes', async () => {
    const body = JSON.stringify(SAVE_BODY);
    expect((await request('/brand', { method: 'PUT', headers: jsonHeaders(), body })).status).toBe(401);
    const { token: adminToken } = await seedAdminAndLogin();
    expect(
      (await request('/brand', { method: 'PUT', headers: jsonHeaders(adminToken), body })).status,
    ).toBe(403);
    const { token: ownerToken } = await seedOwnerAndLogin();
    const res = await request('/brand', { method: 'PUT', headers: jsonHeaders(ownerToken), body });
    expect(res.status).toBe(200);
  });

  test('owner save materializes keys to CDN URLs and GET serves the row', async () => {
    const { token } = await seedOwnerAndLogin();
    const put = await request('/brand', {
      method: 'PUT',
      headers: jsonHeaders(token),
      body: JSON.stringify(SAVE_BODY),
    });
    const saved = await json<Brand & { logoKey?: string }>(put);
    // Brand assets live in the manttio-logos bucket → its own CDN base.
    expect(saved.logoUrl).toBe(`${workerEnv.LOGOS_CDN_BASE_URL}/${SAVE_BODY.logoKey}`);
    expect(saved.logoKey).toBeUndefined(); // keys never leave the backend
    expect(saved.colors.primary['1000']).toBe(SAVE_BODY.colors.primary['1000']);

    const read = await json<Brand>(await request('/brand'));
    expect(read.name).toBe('Acme Chillers');
    expect(read.siteUrl).toBe('https://acme.example.com');
    expect(read.font?.heading).toBe('rubik');
  });

  test('PUT /brand is a full replace — omitted fields clear (last write wins)', async () => {
    const { token } = await seedOwnerAndLogin();
    await request('/brand', {
      method: 'PUT',
      headers: jsonHeaders(token),
      body: JSON.stringify(SAVE_BODY),
    });
    const minimal = { name: 'Acme Chillers', colors: SAVE_BODY.colors };
    await request('/brand', {
      method: 'PUT',
      headers: jsonHeaders(token),
      body: JSON.stringify(minimal),
    });
    const read = await json<Brand>(await request('/brand'));
    expect(read.slogan).toBeUndefined();
    expect(read.logoUrl).toBeUndefined();
    expect(read.contact).toBeUndefined();
  });

  test('validators reject hex values, missing steps, and unknown font codes', async () => {
    const { token } = await seedOwnerAndLogin();
    const attempt = async (body: Record<string, unknown>) =>
      (
        await request('/brand', {
          method: 'PUT',
          headers: jsonHeaders(token),
          body: JSON.stringify(body),
        })
      ).status;

    const hexScale = Object.fromEntries(BRAND_SCALE_STEPS.map((s) => [s, '#243345']));
    expect(await attempt({ ...SAVE_BODY, colors: { primary: hexScale, surface: hslScale(0) } })).toBe(400);

    const { '1000': _dropped, ...partialScale } = hslScale(210);
    expect(await attempt({ ...SAVE_BODY, colors: { primary: partialScale, surface: hslScale(0) } })).toBe(400);

    expect(await attempt({ ...SAVE_BODY, font: { body: 'comic_sans' } })).toBe(400);
  });

  test('manager shared token writes; wrong token 401s; unset secret fails closed', async () => {
    const body = JSON.stringify(SAVE_BODY);
    const headers = { 'content-type': 'application/json', 'X-Manager-Token': MANAGER_TOKEN };

    const ok = await managerRequest('/brand', { method: 'PUT', headers, body }, MANAGER_TOKEN);
    expect(ok.status).toBe(200);

    const wrong = await managerRequest(
      '/brand',
      { method: 'PUT', headers: { ...headers, 'X-Manager-Token': 'nope' }, body },
      MANAGER_TOKEN,
    );
    expect(wrong.status).toBe(401);

    // Secret unset on the deployment → the manager path must fail closed even
    // with a matching header, and must not fall through to JWT.
    const failClosed = await managerRequest('/brand', { method: 'PUT', headers, body });
    expect(failClosed.status).toBe(401);
  });

  test('upload admits the manager token (brand pushes carry logos)', async () => {
    // Empty form → 400 no_file proves the request cleared auth; without the
    // token the same request 401s. /upload/logo is the brand-asset route
    // (manttio-logos bucket); the managerOr mount covers all of /upload/*.
    const fd = new FormData();
    const withToken = await managerRequest(
      '/upload/logo',
      { method: 'POST', headers: { 'X-Manager-Token': MANAGER_TOKEN }, body: fd },
      MANAGER_TOKEN,
    );
    expect(withToken.status).toBe(400);

    const anonymous = await managerRequest(
      '/upload/logo',
      { method: 'POST', body: new FormData() },
      MANAGER_TOKEN,
    );
    expect(anonymous.status).toBe(401);
  });

  test('saving with a PNG mark generates the PWA icon set; GET serves the URLs', async () => {
    const { token } = await seedOwnerAndLogin();

    // A real 8×8 opaque PNG, uploaded through the same path a brand push uses.
    const rgba = new Uint8Array(8 * 8 * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 36; rgba[i + 1] = 51; rgba[i + 2] = 69; rgba[i + 3] = 255;
    }
    const png = UPNG.encode([rgba.buffer], 8, 8, 0);
    const fd = new FormData();
    fd.append('file', new File([png], 'mark.png', { type: 'image/png' }));
    const uploaded = await request('/upload/logo', {
      method: 'POST',
      headers: authHeader(token),
      body: fd,
    });
    expect(uploaded.status).toBe(201);
    const { key } = await json<{ key: string }>(uploaded);
    expect(key).toMatch(/^logos\//);

    const put = await request('/brand', {
      method: 'PUT',
      headers: jsonHeaders(token),
      body: JSON.stringify({ ...SAVE_BODY, faviconKey: key }),
    });
    expect(put.status).toBe(200);
    const saved = await json<Brand>(put);
    for (const url of Object.values(saved.icons ?? {})) {
      expect(url).toMatch(new RegExp(`^${workerEnv.LOGOS_CDN_BASE_URL}/icons/`));
    }
    expect(Object.keys(saved.icons ?? {}).sort()).toEqual([
      'any192', 'any512', 'maskable192', 'maskable512',
    ]);

    const read = await json<Brand>(await request('/brand'));
    expect(read.icons?.any512).toBe(saved.icons?.any512);
  });

  test('an undecodable icon source fails soft — brand saves without icons', async () => {
    const { token } = await seedOwnerAndLogin();
    const res = await request('/brand', {
      method: 'PUT',
      headers: jsonHeaders(token),
      body: JSON.stringify({ ...SAVE_BODY, faviconKey: 'branding/does-not-exist.png' }),
    });
    expect(res.status).toBe(200);
    const saved = await json<Brand>(res);
    expect(saved.icons).toBeUndefined();
    expect(saved.faviconUrl).toBe(`${workerEnv.LOGOS_CDN_BASE_URL}/branding/does-not-exist.png`);
  });

  test('GET /brand hides authored-but-empty identity and echoes social/contact', async () => {
    const { token } = await seedOwnerAndLogin();
    await request('/brand', {
      method: 'PUT',
      headers: jsonHeaders(token),
      body: JSON.stringify(SAVE_BODY),
    });
    const read = await json<Brand>(await request('/brand'));
    expect(read.social?.facebook).toBe('https://facebook.com/acme');
    expect(read.contact?.email).toBe('hola@acme.example.com');
    expect(read.faviconUrl).toBeUndefined();
    expect(read.isologoUrl).toBeUndefined();
  });
});

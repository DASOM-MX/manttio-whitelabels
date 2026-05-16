import { describe, expect, test } from 'vitest';
import { authHeader, env, json, request } from './helpers/request';
import { seedAdminAndLogin, seedTechnicianAndLogin } from './helpers/fixtures';

type WorkerEnv = { MANTTIO_REPORTS: R2Bucket; CDN_BASE_URL: string };

const KEY_RE = /^reports\/\d+-[a-zA-Z0-9._-]+$/;

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk header
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89,
]);

const makeImage = (
  name: string,
  type = 'image/png',
  bytes: Uint8Array = PNG_BYTES,
): File => new File([bytes], name, { type });

const formWith = (file: File | null | string, field = 'file'): FormData => {
  const fd = new FormData();
  if (file !== null) fd.set(field, file as Blob | string);
  return fd;
};

const r2 = () => (env as unknown as WorkerEnv).MANTTIO_REPORTS;
const cdnBase = () => (env as unknown as WorkerEnv).CDN_BASE_URL;

describe('POST /upload/image – happy path', () => {
  test('admin uploads a PNG → 201 with key + cdn url', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/upload/image', {
      method: 'POST',
      headers: authHeader(token),
      body: formWith(makeImage('photo.png')),
    });
    expect(res.status).toBe(201);
    const body = await json<{ key: string; url: string }>(res);
    expect(body.key).toMatch(KEY_RE);
    expect(body.key.endsWith('-photo.png')).toBe(true);
    expect(body.url).toBe(`${cdnBase()}/${body.key}`);
  });

  test('uploaded bytes are actually written to the R2 bucket', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/upload/image', {
      method: 'POST',
      headers: authHeader(token),
      body: formWith(makeImage('verify.png')),
    });
    expect(res.status).toBe(201);
    const { key } = await json<{ key: string }>(res);

    const stored = await r2().get(key);
    expect(stored).not.toBeNull();
    const storedBytes = new Uint8Array(await stored!.arrayBuffer());
    expect(storedBytes.length).toBe(PNG_BYTES.length);
    expect(Array.from(storedBytes)).toEqual(Array.from(PNG_BYTES));
  });

  test('content-type is preserved on the stored R2 object', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/upload/image', {
      method: 'POST',
      headers: authHeader(token),
      body: formWith(makeImage('with-ct.jpeg', 'image/jpeg')),
    });
    expect(res.status).toBe(201);
    const { key } = await json<{ key: string }>(res);
    const stored = await r2().get(key);
    expect(stored?.httpMetadata?.contentType).toBe('image/jpeg');
  });

  test('technician can upload too (route open to both roles)', async () => {
    const { token } = await seedTechnicianAndLogin();
    const res = await request('/upload/image', {
      method: 'POST',
      headers: authHeader(token),
      body: formWith(makeImage('tech.png')),
    });
    expect(res.status).toBe(201);
    const body = await json<{ key: string }>(res);
    expect(body.key).toMatch(KEY_RE);
  });

  test('accepts image/jpeg', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/upload/image', {
      method: 'POST',
      headers: authHeader(token),
      body: formWith(makeImage('shot.jpg', 'image/jpeg')),
    });
    expect(res.status).toBe(201);
  });

  test('accepts image/webp', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/upload/image', {
      method: 'POST',
      headers: authHeader(token),
      body: formWith(makeImage('shot.webp', 'image/webp')),
    });
    expect(res.status).toBe(201);
  });

  test('accepts image/gif', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/upload/image', {
      method: 'POST',
      headers: authHeader(token),
      body: formWith(makeImage('anim.gif', 'image/gif')),
    });
    expect(res.status).toBe(201);
  });
});

describe('POST /upload/image – key derivation', () => {
  test('special characters in filename are sanitized to underscores in the key', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/upload/image', {
      method: 'POST',
      headers: authHeader(token),
      body: formWith(makeImage('my photo (1).jpeg', 'image/jpeg')),
    });
    expect(res.status).toBe(201);
    const { key } = await json<{ key: string }>(res);
    // r2Key prefixes `reports/<ms>-` and safeName replaces every non
    // [a-zA-Z0-9._-] char with `_`. Spaces and parens both become `_`.
    expect(key.endsWith('-my_photo__1_.jpeg')).toBe(true);
  });

  test('successive uploads with distinct names produce distinct keys', async () => {
    const { token } = await seedAdminAndLogin();
    const a = await request('/upload/image', {
      method: 'POST',
      headers: authHeader(token),
      body: formWith(makeImage('a.png')),
    });
    const b = await request('/upload/image', {
      method: 'POST',
      headers: authHeader(token),
      body: formWith(makeImage('b.png')),
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const { key: keyA } = await json<{ key: string }>(a);
    const { key: keyB } = await json<{ key: string }>(b);
    expect(keyA).not.toBe(keyB);
  });
});

describe('POST /upload/image – validation errors', () => {
  test('missing file field → 400 no_file', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/upload/image', {
      method: 'POST',
      headers: authHeader(token),
      body: formWith(null),
    });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: 'no_file' });
  });

  test('wrong field name (image instead of file) → 400 no_file', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/upload/image', {
      method: 'POST',
      headers: authHeader(token),
      body: formWith(makeImage('photo.png'), 'image'),
    });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: 'no_file' });
  });

  test('file field is a plain string (not a File) → 400 no_file', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/upload/image', {
      method: 'POST',
      headers: authHeader(token),
      body: formWith('not-a-file'),
    });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: 'no_file' });
  });

  test('non-image content-type (application/pdf) → 415 not_an_image', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/upload/image', {
      method: 'POST',
      headers: authHeader(token),
      body: formWith(makeImage('doc.pdf', 'application/pdf')),
    });
    expect(res.status).toBe(415);
    const body = await json<{ error: string; message?: string }>(res);
    expect(body.error).toBe('not_an_image');
    expect(body.message).toContain('application/pdf');
  });

  test('non-image content-type (text/plain) → 415 not_an_image', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/upload/image', {
      method: 'POST',
      headers: authHeader(token),
      body: formWith(makeImage('readme.txt', 'text/plain')),
    });
    expect(res.status).toBe(415);
    expect((await json<{ error: string }>(res)).error).toBe('not_an_image');
  });

  test('application/octet-stream (no type sniffing) → 415 not_an_image', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/upload/image', {
      method: 'POST',
      headers: authHeader(token),
      body: formWith(makeImage('blob.bin', 'application/octet-stream')),
    });
    expect(res.status).toBe(415);
  });

  test('rejected uploads do not leave anything in R2', async () => {
    const { token } = await seedAdminAndLogin();
    const before = (await r2().list()).objects.length;
    const res = await request('/upload/image', {
      method: 'POST',
      headers: authHeader(token),
      body: formWith(makeImage('blob.bin', 'application/octet-stream')),
    });
    expect(res.status).toBe(415);
    const after = (await r2().list()).objects.length;
    expect(after).toBe(before);
  });
});

describe('POST /upload/image – auth', () => {
  test('missing Authorization header → 401 unauthorized', async () => {
    const res = await request('/upload/image', {
      method: 'POST',
      body: formWith(makeImage('photo.png')),
    });
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ error: 'unauthorized' });
  });

  test('garbage Bearer token → 401', async () => {
    const res = await request('/upload/image', {
      method: 'POST',
      headers: authHeader('not.a.real.jwt'),
      body: formWith(makeImage('photo.png')),
    });
    expect(res.status).toBe(401);
  });
});

describe('upload route – method / path', () => {
  test('GET /upload/image → 404 not_found (only POST is registered)', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/upload/image', { headers: authHeader(token) });
    expect(res.status).toBe(404);
  });

  test('POST /upload/unknown → 404 not_found', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/upload/unknown', {
      method: 'POST',
      headers: authHeader(token),
      body: formWith(makeImage('photo.png')),
    });
    expect(res.status).toBe(404);
  });
});

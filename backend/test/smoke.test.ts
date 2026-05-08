import { describe, expect, test } from 'vitest';
import { json, request } from './helpers/request';
import { seedAdmin, loginAs } from './helpers/fixtures';

describe('harness smoke', () => {
  test('GET / returns the service banner', async () => {
    const res = await request('/');
    expect(res.status).toBe(200);
    const body = await json<{ name: string; status: string }>(res);
    expect(body).toEqual({ name: 'manttio-api', status: 'ok' });
  });

  test('seeded admin can log in and receive a token', async () => {
    const admin = await seedAdmin();
    const token = await loginAs(admin);
    expect(token.split('.')).toHaveLength(3);
  });

  test('protected route rejects when no JWT is sent', async () => {
    const res = await request('/users/me');
    expect(res.status).toBe(401);
  });
});

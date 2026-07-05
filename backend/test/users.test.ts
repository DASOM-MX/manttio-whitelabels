import { describe, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { authHeader, env, json, jsonHeaders, request } from './helpers/request';
import {
  loginAs,
  seedAdmin,
  seedAdminAndLogin,
  seedTechnician,
  seedTechnicianAndLogin,
  uniqueEmail,
} from './helpers/fixtures';
import { createDb } from '../src/modules/database/client';
import { users } from '../src/modules/database/schema';

type WorkerEnv = { DATABASE_URL: string };

type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'technician';
  createdAt: string;
  updatedAt: string;
};

const headersWith = (token: string) => ({ ...jsonHeaders(token) });

describe('GET /users/me', () => {
  test('admin sees own user', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const res = await request('/users/me', { headers: authHeader(token) });
    expect(res.status).toBe(200);
    const body = await json<{ user: PublicUser }>(res);
    expect(body.user.id).toBe(admin.id);
    expect(body.user.email).toBe(admin.email);
    expect(body.user.role).toBe('admin');
    expect(body.user).not.toHaveProperty('passwordHash');
  });

  test('technician sees own user (bypasses admin gate)', async () => {
    const { tech, token } = await seedTechnicianAndLogin();
    const res = await request('/users/me', { headers: authHeader(token) });
    expect(res.status).toBe(200);
    const body = await json<{ user: PublicUser }>(res);
    expect(body.user.id).toBe(tech.id);
    expect(body.user.role).toBe('technician');
  });

  test('returns 404 if the underlying user was soft-deleted out from under a live token', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const db = createDb((env as unknown as WorkerEnv).DATABASE_URL);
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, admin.id));

    const res = await request('/users/me', { headers: authHeader(token) });
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ error: 'not_found' });
  });
});

describe('GET /users/list', () => {
  test('admin gets a list including the seeded admin', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const res = await request('/users/list', { headers: authHeader(token) });
    expect(res.status).toBe(200);
    const body = await json<{ users: PublicUser[] }>(res);
    expect(Array.isArray(body.users)).toBe(true);
    expect(body.users.some((u) => u.id === admin.id)).toBe(true);
    body.users.forEach((u) => expect(u).not.toHaveProperty('passwordHash'));
  });

  test('technician is rejected with 403 forbidden', async () => {
    const { token } = await seedTechnicianAndLogin();
    const res = await request('/users/list', { headers: authHeader(token) });
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ error: 'forbidden' });
  });
});

describe('GET /users/:id', () => {
  test('admin can fetch another user by id', async () => {
    const { token } = await seedAdminAndLogin();
    const tech = await seedTechnician();

    const res = await request(`/users/${tech.id}`, { headers: authHeader(token) });
    expect(res.status).toBe(200);
    const body = await json<{ user: PublicUser }>(res);
    expect(body.user.id).toBe(tech.id);
    expect(body.user.email).toBe(tech.email);
  });

  test('unknown id → 404 not_found', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/users/00000000-0000-0000-0000-000000000000', {
      headers: authHeader(token),
    });
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ error: 'not_found' });
  });

  test('technician is rejected with 403 forbidden', async () => {
    const { tech, token } = await seedTechnicianAndLogin();
    const res = await request(`/users/${tech.id}`, { headers: authHeader(token) });
    expect(res.status).toBe(403);
  });
});

describe('POST /users', () => {
  test('admin creates a technician (201)', async () => {
    const { token } = await seedAdminAndLogin();
    const email = uniqueEmail('create');
    const res = await request('/users', {
      method: 'POST',
      headers: headersWith(token),
      body: JSON.stringify({
        name: 'test created user',
        email,
        password: 'password-123',
        role: 'technician',
      }),
    });
    expect(res.status).toBe(201);
    const body = await json<{ user: PublicUser }>(res);
    expect(body.user.email).toBe(email);
    expect(body.user.role).toBe('technician');
    expect(body.user).not.toHaveProperty('passwordHash');
  });

  test('the created user can log in immediately', async () => {
    const { token } = await seedAdminAndLogin();
    const email = uniqueEmail('login-after-create');
    const password = 'password-456';
    const createRes = await request('/users', {
      method: 'POST',
      headers: headersWith(token),
      body: JSON.stringify({ name: 'login-after-create', email, password, role: 'admin' }),
    });
    expect(createRes.status).toBe(201);

    const jwt = await loginAs({ email, password });
    expect(jwt.split('.')).toHaveLength(3);
  });

  test('duplicate email → 409 email_in_use', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const res = await request('/users', {
      method: 'POST',
      headers: headersWith(token),
      body: JSON.stringify({
        name: 'dup',
        email: admin.email,
        password: 'password-123',
        role: 'technician',
      }),
    });
    expect(res.status).toBe(409);
    expect(await json(res)).toEqual({ error: 'email_in_use' });
  });

  test('soft-deleted user does not block re-registration of the same email', async () => {
    const { token } = await seedAdminAndLogin();
    const email = uniqueEmail('reuse-after-soft-delete');

    const first = await request('/users', {
      method: 'POST',
      headers: headersWith(token),
      body: JSON.stringify({ name: 'first', email, password: 'password-123', role: 'technician' }),
    });
    expect(first.status).toBe(201);
    const firstBody = await json<{ user: PublicUser }>(first);

    const del = await request(`/users/${firstBody.user.id}`, {
      method: 'DELETE',
      headers: authHeader(token),
    });
    expect(del.status).toBe(200);

    const second = await request('/users', {
      method: 'POST',
      headers: headersWith(token),
      body: JSON.stringify({
        name: 'second',
        email,
        password: 'password-789',
        role: 'admin',
      }),
    });
    expect(second.status).toBe(201);
    const secondBody = await json<{ user: PublicUser }>(second);
    expect(secondBody.user.id).not.toBe(firstBody.user.id);
    expect(secondBody.user.email).toBe(email);
  });

  test('validation: weak password (<8) → 400', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/users', {
      method: 'POST',
      headers: headersWith(token),
      body: JSON.stringify({
        name: 'weak',
        email: uniqueEmail('weak'),
        password: 'short',
        role: 'technician',
      }),
    });
    expect(res.status).toBe(400);
  });

  test('validation: invalid role → 400', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/users', {
      method: 'POST',
      headers: headersWith(token),
      body: JSON.stringify({
        name: 'bad-role',
        email: uniqueEmail('bad-role'),
        password: 'password-123',
        role: 'superadmin',
      }),
    });
    expect(res.status).toBe(400);
  });

  test('technician cannot create users → 403', async () => {
    const { token } = await seedTechnicianAndLogin();
    const res = await request('/users', {
      method: 'POST',
      headers: headersWith(token),
      body: JSON.stringify({
        name: 'nope',
        email: uniqueEmail('forbidden'),
        password: 'password-123',
        role: 'technician',
      }),
    });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /users/:id', () => {
  test('admin can rename a user', async () => {
    const { token } = await seedAdminAndLogin();
    const tech = await seedTechnician();

    const res = await request(`/users/${tech.id}`, {
      method: 'PATCH',
      headers: headersWith(token),
      body: JSON.stringify({ name: 'renamed' }),
    });
    expect(res.status).toBe(200);
    const body = await json<{ user: PublicUser }>(res);
    expect(body.user.name).toBe('renamed');
    expect(body.user.email).toBe(tech.email);
  });

  test('admin can change password and the new password works for login', async () => {
    const { token } = await seedAdminAndLogin();
    const tech = await seedTechnician();
    const newPassword = 'rotated-password-1';

    const res = await request(`/users/${tech.id}`, {
      method: 'PATCH',
      headers: headersWith(token),
      body: JSON.stringify({ password: newPassword }),
    });
    expect(res.status).toBe(200);

    const oldLogin = await request('/auth/login', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ email: tech.email, password: tech.password }),
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request('/auth/login', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ email: tech.email, password: newPassword }),
    });
    expect(newLogin.status).toBe(200);
  });

  test('email collision with another active user → 409', async () => {
    const { token } = await seedAdminAndLogin();
    const a = await seedTechnician();
    const b = await seedTechnician();

    const res = await request(`/users/${a.id}`, {
      method: 'PATCH',
      headers: headersWith(token),
      body: JSON.stringify({ email: b.email }),
    });
    expect(res.status).toBe(409);
    expect(await json(res)).toEqual({ error: 'email_in_use' });
  });

  test('unknown id → 404 not_found', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/users/00000000-0000-0000-0000-000000000000', {
      method: 'PATCH',
      headers: headersWith(token),
      body: JSON.stringify({ name: 'nope' }),
    });
    expect(res.status).toBe(404);
  });

  test('empty body (no fields) → 400', async () => {
    const { token } = await seedAdminAndLogin();
    const tech = await seedTechnician();
    const res = await request(`/users/${tech.id}`, {
      method: 'PATCH',
      headers: headersWith(token),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test('technician cannot patch → 403', async () => {
    const { tech, token } = await seedTechnicianAndLogin();
    const res = await request(`/users/${tech.id}`, {
      method: 'PATCH',
      headers: headersWith(token),
      body: JSON.stringify({ name: 'self-rename' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /users/:id', () => {
  const deleteBody = { deleteComment: 'Test cleanup' };

  test('admin can soft-delete another user', async () => {
    const { token } = await seedAdminAndLogin();
    const tech = await seedTechnician();

    const res = await request(`/users/${tech.id}`, {
      method: 'DELETE',
      headers: jsonHeaders(token),
      body: JSON.stringify(deleteBody),
    });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ id: tech.id, deleted: true });

    const after = await request(`/users/${tech.id}`, { headers: authHeader(token) });
    expect(after.status).toBe(404);
  });

  test('soft-deleted user can no longer log in', async () => {
    const { token } = await seedAdminAndLogin();
    const tech = await seedTechnician();
    await request(`/users/${tech.id}`, {
      method: 'DELETE',
      headers: jsonHeaders(token),
      body: JSON.stringify(deleteBody),
    });

    const res = await request('/auth/login', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ email: tech.email, password: tech.password }),
    });
    expect(res.status).toBe(401);
  });

  test('admin cannot delete themselves → 400 cannot_delete_self', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const res = await request(`/users/${admin.id}`, {
      method: 'DELETE',
      headers: jsonHeaders(token),
      body: JSON.stringify(deleteBody),
    });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: 'cannot_delete_self' });
  });

  test('deleting an unknown id → 404', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/users/00000000-0000-0000-0000-000000000000', {
      method: 'DELETE',
      headers: jsonHeaders(token),
      body: JSON.stringify(deleteBody),
    });
    expect(res.status).toBe(404);
  });

  test('deleting an already-deleted user → 404 (idempotent in spirit)', async () => {
    const { token } = await seedAdminAndLogin();
    const tech = await seedTechnician();

    const first = await request(`/users/${tech.id}`, {
      method: 'DELETE',
      headers: jsonHeaders(token),
      body: JSON.stringify(deleteBody),
    });
    expect(first.status).toBe(200);

    const second = await request(`/users/${tech.id}`, {
      method: 'DELETE',
      headers: jsonHeaders(token),
      body: JSON.stringify(deleteBody),
    });
    expect(second.status).toBe(404);
  });

  test('missing deleteComment → 400 validation error', async () => {
    const { token } = await seedAdminAndLogin();
    const tech = await seedTechnician();
    const res = await request(`/users/${tech.id}`, {
      method: 'DELETE',
      headers: jsonHeaders(token),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test('blank deleteComment → 400 validation error', async () => {
    const { token } = await seedAdminAndLogin();
    const tech = await seedTechnician();
    const res = await request(`/users/${tech.id}`, {
      method: 'DELETE',
      headers: jsonHeaders(token),
      body: JSON.stringify({ deleteComment: '   ' }),
    });
    expect(res.status).toBe(400);
  });

  test('technician cannot delete → 403', async () => {
    const { token } = await seedTechnicianAndLogin();
    const target = await seedAdmin();
    const res = await request(`/users/${target.id}`, {
      method: 'DELETE',
      headers: jsonHeaders(token),
      body: JSON.stringify(deleteBody),
    });
    expect(res.status).toBe(403);
  });
});

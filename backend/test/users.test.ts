import { describe, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { authHeader, env, json, jsonHeaders, request } from './helpers/request';
import {
  loginAs,
  seedAdmin,
  seedAdminAndLogin,
  seedOfficeAndLogin,
  seedOwner,
  seedOwnerAndLogin,
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
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type PagedUsers = { items: PublicUser[]; total: number; page: number; limit: number };

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

describe('GET /users (paged roster)', () => {
  test('admin gets the paged envelope; search pins the seeded row', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const res = await request(`/users?search=${encodeURIComponent(admin.email)}`, {
      headers: authHeader(token),
    });
    expect(res.status).toBe(200);
    const body = await json<PagedUsers>(res);
    expect(body.page).toBe(1);
    expect(body.total).toBe(1);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.id).toBe(admin.id);
    expect(body.items[0]!.active).toBe(true);
    body.items.forEach((u) => expect(u).not.toHaveProperty('passwordHash'));
  });

  test('role filter + limit are honored', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/users?role=technician&limit=1', { headers: authHeader(token) });
    expect(res.status).toBe(200);
    const body = await json<PagedUsers>(res);
    expect(body.limit).toBe(1);
    expect(body.items.length).toBeLessThanOrEqual(1);
    body.items.forEach((u) => expect(u.role).toBe('technician'));
  });

  test('active=false matches nothing until the deactivation column lands', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/users?active=false', { headers: authHeader(token) });
    expect(res.status).toBe(200);
    expect(await json<PagedUsers>(res)).toEqual({ items: [], total: 0, page: 1, limit: 25 });
  });

  test('limit above the cap is rejected', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/users?limit=1000', { headers: authHeader(token) });
    expect(res.status).toBe(400);
  });

  test('owner and office pass the roster gate', async () => {
    const { token: ownerToken } = await seedOwnerAndLogin();
    expect((await request('/users?limit=1', { headers: authHeader(ownerToken) })).status).toBe(200);
    const { token: officeToken } = await seedOfficeAndLogin();
    expect((await request('/users?limit=1', { headers: authHeader(officeToken) })).status).toBe(
      200,
    );
  });

  test('technician is rejected with 403 forbidden', async () => {
    const { token } = await seedTechnicianAndLogin();
    const res = await request('/users?limit=1', { headers: authHeader(token) });
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ error: 'forbidden' });
  });

  test('the retired /users/list path 404s instead of matching :id', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/users/list', { headers: authHeader(token) });
    expect(res.status).toBe(404);
    expect(await json(res)).toEqual({ error: 'not_found' });
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
      headers: jsonHeaders(token),
      body: JSON.stringify({ deleteComment: 'Test cleanup' }),
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

  test('owner role is not grantable via the API → 400', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/users', {
      method: 'POST',
      headers: headersWith(token),
      body: JSON.stringify({
        name: 'wannabe-owner',
        email: uniqueEmail('wannabe-owner'),
        password: 'password-123',
        role: 'owner',
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
  test('owner rows are immutable in-tenant → 403 cannot_modify_owner', async () => {
    const { token } = await seedAdminAndLogin();
    const owner = await seedOwner();

    const res = await request(`/users/${owner.id}`, {
      method: 'PATCH',
      headers: headersWith(token),
      body: JSON.stringify({ password: 'hijacked-password-1' }),
    });
    expect(res.status).toBe(403);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe('cannot_modify_owner');
  });

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

  test('owner rows cannot be deleted in-tenant → 403 cannot_modify_owner', async () => {
    const { token } = await seedAdminAndLogin();
    const owner = await seedOwner();

    const res = await request(`/users/${owner.id}`, {
      method: 'DELETE',
      headers: jsonHeaders(token),
      body: JSON.stringify(deleteBody),
    });
    expect(res.status).toBe(403);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe('cannot_modify_owner');
  });

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

// Temp-password model + role-gated reset (backend plan §1).
const TEMP_PASSWORD_RE = /^tmp_[A-Za-z0-9]{18}$/;

describe('POST /users (temp-password model)', () => {
  test('omitting password issues a one-time temp password and flags the forced change', async () => {
    const { token } = await seedAdminAndLogin();
    const email = uniqueEmail('temp-create');
    const res = await request('/users', {
      method: 'POST',
      headers: headersWith(token),
      body: JSON.stringify({ name: 'test temp create', email, role: 'technician' }),
    });
    expect(res.status).toBe(201);
    const body = await json<{ user: PublicUser & { mustChangePassword: boolean }; tempPassword: string }>(res);
    expect(body.tempPassword).toMatch(TEMP_PASSWORD_RE);
    expect(body.user.mustChangePassword).toBe(true);

    // The temp password is a live credential; login surfaces the flag.
    const login = await request('/auth/login', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ email, password: body.tempPassword }),
    });
    expect(login.status).toBe(200);
    const loginBody = await json<{ token: string; mustChangePassword: boolean }>(login);
    expect(loginBody.mustChangePassword).toBe(true);
  });

  test('supplying a password keeps the legacy path: no tempPassword, no flag', async () => {
    const { token } = await seedAdminAndLogin();
    const res = await request('/users', {
      method: 'POST',
      headers: headersWith(token),
      body: JSON.stringify({
        name: 'test legacy create',
        email: uniqueEmail('legacy-create'),
        password: 'explicit-pw-123',
        role: 'technician',
      }),
    });
    expect(res.status).toBe(201);
    const body = await json<{ user: { mustChangePassword: boolean }; tempPassword?: string }>(res);
    expect(body.tempPassword).toBeUndefined();
    expect(body.user.mustChangePassword).toBe(false);
  });
});

describe('POST /users/:id/password (role-gated reset)', () => {
  test('owner resets an admin: temp replaces the old credential', async () => {
    const { token } = await seedOwnerAndLogin();
    const admin = await seedAdmin();
    const res = await request(`/users/${admin.id}/password`, {
      method: 'POST',
      headers: headersWith(token),
    });
    expect(res.status).toBe(200);
    const { tempPassword } = await json<{ tempPassword: string }>(res);
    expect(tempPassword).toMatch(TEMP_PASSWORD_RE);

    const oldLogin = await request('/auth/login', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ email: admin.email, password: admin.password }),
    });
    expect(oldLogin.status).toBe(401);

    const tempLogin = await request('/auth/login', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ email: admin.email, password: tempPassword }),
    });
    expect(tempLogin.status).toBe(200);
    const body = await json<{ mustChangePassword: boolean }>(tempLogin);
    expect(body.mustChangePassword).toBe(true);
  });

  test('admin resets a technician', async () => {
    const { token } = await seedAdminAndLogin();
    const tech = await seedTechnician();
    const res = await request(`/users/${tech.id}/password`, {
      method: 'POST',
      headers: headersWith(token),
    });
    expect(res.status).toBe(200);
  });

  test('admin cannot reset another admin → 403 cannot_reset_password', async () => {
    const { token } = await seedAdminAndLogin();
    const other = await seedAdmin();
    const res = await request(`/users/${other.id}/password`, {
      method: 'POST',
      headers: headersWith(token),
    });
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ error: 'cannot_reset_password' });
  });

  test('nobody resets the owner in-tenant (admin nor owner)', async () => {
    const owner = await seedOwner();
    for (const seeded of [await seedAdminAndLogin(), await seedOwnerAndLogin()]) {
      const res = await request(`/users/${owner.id}/password`, {
        method: 'POST',
        headers: headersWith(seeded.token),
      });
      expect(res.status).toBe(403);
      expect(await json(res)).toEqual({ error: 'cannot_reset_password' });
    }
  });

  test('technician is rejected by the admin gate → 403 forbidden', async () => {
    const { token } = await seedTechnicianAndLogin();
    const target = await seedTechnician();
    const res = await request(`/users/${target.id}/password`, {
      method: 'POST',
      headers: headersWith(token),
    });
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ error: 'forbidden' });
  });

  test('unknown id → 404', async () => {
    const { token } = await seedOwnerAndLogin();
    const res = await request(`/users/${crypto.randomUUID()}/password`, {
      method: 'POST',
      headers: headersWith(token),
    });
    expect(res.status).toBe(404);
  });
});

describe('user Mexican surnames (2026-07-21)', () => {
  test('create echoes both surnames; PATCH updates one; legacy create still works without them', async () => {
    const { token } = await seedAdminAndLogin();

    const res = await request('/users', {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify({
        name: 'María',
        paternalLastName: 'García',
        maternalLastName: 'López',
        email: uniqueEmail('surnames'),
        role: 'technician',
      }),
    });
    expect(res.status).toBe(201);
    const created = await json<{
      user: { id: string; paternalLastName: string | null; maternalLastName: string | null };
    }>(res);
    expect(created.user.paternalLastName).toBe('García');
    expect(created.user.maternalLastName).toBe('López');

    const patch = await request(`/users/${created.user.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(token),
      body: JSON.stringify({ maternalLastName: 'Hernández' }),
    });
    expect(patch.status).toBe(200);
    const patched = await json<{ user: { maternalLastName: string | null } }>(patch);
    expect(patched.user.maternalLastName).toBe('Hernández');

    // The legacy field-app path (no surnames) keeps working.
    const legacy = await request('/users', {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify({ name: 'Solo Nombre', email: uniqueEmail('legacy'), role: 'technician' }),
    });
    expect(legacy.status).toBe(201);
    const legacyBody = await json<{ user: { paternalLastName: string | null } }>(legacy);
    expect(legacyBody.user.paternalLastName).toBeNull();
  });
});

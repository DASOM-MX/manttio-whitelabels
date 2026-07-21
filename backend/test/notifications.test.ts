import { afterAll, describe, expect, test } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { authHeader, env, json, request } from './helpers/request';
import { seedAdmin, seedAdminAndLogin, seedOwner, seedTechnicianAndLogin } from './helpers/fixtures';
import { createDb } from '../src/modules/database/client';
import { notifications, users } from '../src/modules/database/schema';
import { notify } from '../src/modules/notifications/services/notifications.service';
import { NotificationType } from '../src/modules/notifications/enums/notifications.enum';
import type { NotificationRow, NotificationView } from '../src/modules/notifications/types/notifications.types';

type WorkerEnv = { DATABASE_URL: string };

// One client for the whole file: a per-call pool leaves dozens of idle Neon
// WebSockets that workerd tears down mid-run as unhandled network errors.
let client: ReturnType<typeof createDb> | undefined;
const db = () => (client ??= createDb((env as unknown as WorkerEnv).DATABASE_URL));

const tag = () => Math.random().toString(36).slice(2, 10);
const testTitle = (scope: string) => `notif-test-${scope}-${tag()}`;

// Every row this suite creates. Role broadcasts resolve against the LIVE
// users table, so they also address real (non-fixture) admins/owners — those
// copies must not linger. Notifications are the sanctioned hard-delete leaf
// (plan §0: transient delivery copies, nothing FKs to them, the retention
// sweep hard-deletes them anyway), so cleanup deletes by id — the same
// exception class, no audit trail touched.
const createdIds: string[] = [];
const track = (rows: NotificationRow[]) => {
  createdIds.push(...rows.map((r) => r.id));
  return rows;
};

afterAll(async () => {
  if (createdIds.length === 0) return;
  await db().delete(notifications).where(inArray(notifications.id, createdIds));
});

type ListBody = {
  items: NotificationView[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
};

describe('notify()', () => {
  test('direct send inserts one unread row for the recipient', async () => {
    const admin = await seedAdmin();
    const title = testTitle('direct');
    const rows = track(
      await notify(db(), {
        recipientUserId: admin.id,
        type: NotificationType.ReplenishmentReady,
        title,
        body: 'cuerpo de prueba',
        data: { importId: 'imp-1', link: '/wms/approval?import=imp-1' },
      }),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.recipientUserId).toBe(admin.id);
    expect(rows[0]!.status).toBe('unread');
    expect(rows[0]!.readAt).toBeNull();
    // Provenance is broadcast-only — a direct send carries no audience_role.
    expect(rows[0]!.audienceRole).toBeNull();
    expect(rows[0]!.title).toBe(title);
    expect(rows[0]!.data).toEqual({ importId: 'imp-1', link: '/wms/approval?import=imp-1' });
  });

  test('unknown or inactive direct recipient yields zero rows, no error', async () => {
    const rows = await notify(db(), {
      recipientUserId: crypto.randomUUID(),
      type: NotificationType.ReplenishmentReady,
      title: testTitle('ghost'),
      body: 'x',
    });
    expect(rows).toEqual([]);
  });

  test('neither recipientUserId nor role is a programmer error', async () => {
    await expect(
      notify(db(), {
        type: NotificationType.ReplenishmentReady,
        title: testTitle('invalid'),
        body: 'x',
      }),
    ).rejects.toThrow(/recipientUserId or a role/);
  });

  test('a role list resolving no active users yields zero rows, no error', async () => {
    const rows = await notify(db(), {
      role: [],
      type: NotificationType.ReplenishmentFailed,
      title: testTitle('nobody'),
      body: 'x',
    });
    expect(rows).toEqual([]);
  });

  test('role broadcast fans out one row per active user of the role, skipping soft-deleted', async () => {
    const adminA = await seedAdmin();
    const adminB = await seedAdmin();
    const adminGone = await seedAdmin();
    await db().update(users).set({ deletedAt: new Date() }).where(eq(users.id, adminGone.id));

    const rows = track(
      await notify(db(), {
        role: 'admin',
        type: NotificationType.ReplenishmentFailed,
        title: testTitle('broadcast'),
        body: 'x',
      }),
    );

    const forA = rows.filter((r) => r.recipientUserId === adminA.id);
    const forB = rows.filter((r) => r.recipientUserId === adminB.id);
    expect(forA).toHaveLength(1);
    expect(forB).toHaveLength(1);
    expect(forA[0]!.audienceRole).toBe('admin');
    expect(rows.some((r) => r.recipientUserId === adminGone.id)).toBe(false);
  });

  test('multi-role broadcast dedupes (single-role users match at most once)', async () => {
    const owner = await seedOwner();
    const rows = track(
      await notify(db(), {
        role: ['owner', 'admin'],
        type: NotificationType.ReplenishmentReady,
        title: testTitle('multirole'),
        body: 'x',
      }),
    );
    expect(rows.filter((r) => r.recipientUserId === owner.id)).toHaveLength(1);
    expect(rows.find((r) => r.recipientUserId === owner.id)!.audienceRole).toBe('owner');
  });

  test('recipientUserId wins over role — one row, no audience_role', async () => {
    const admin = await seedAdmin();
    const rows = track(
      await notify(db(), {
        recipientUserId: admin.id,
        role: ['owner', 'admin'],
        type: NotificationType.ReplenishmentRejected,
        title: testTitle('direct-wins'),
        body: 'x',
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.recipientUserId).toBe(admin.id);
    expect(rows[0]!.audienceRole).toBeNull();
  });
});

describe('GET /notifications', () => {
  test('requires auth', async () => {
    const res = await request('/notifications');
    expect(res.status).toBe(401);
  });

  test('lists only the caller\'s rows, newest first, with unreadCount', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const t1 = testTitle('list-1');
    const t2 = testTitle('list-2');
    for (const title of [t1, t2]) {
      track(
        await notify(db(), {
          recipientUserId: admin.id,
          type: NotificationType.ReplenishmentReady,
          title,
          body: 'x',
        }),
      );
    }

    const res = await request('/notifications', { headers: authHeader(token) });
    expect(res.status).toBe(200);
    const body = await json<ListBody>(res);
    // The recipient is a freshly-seeded fixture, so the counts are exact.
    expect(body.total).toBe(2);
    expect(body.unreadCount).toBe(2);
    expect(body.items.map((i) => i.title).sort()).toEqual([t1, t2].sort());

    // A different authenticated user sees nothing.
    const { token: otherToken } = await seedTechnicianAndLogin();
    const otherRes = await request('/notifications', { headers: authHeader(otherToken) });
    const otherBody = await json<ListBody>(otherRes);
    expect(otherBody.total).toBe(0);
    expect(otherBody.unreadCount).toBe(0);
    expect(otherBody.items).toEqual([]);
  });

  test('supports the unread filter and pagination', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const rows: NotificationRow[] = [];
    for (let i = 0; i < 3; i++) {
      rows.push(
        ...track(
          await notify(db(), {
            recipientUserId: admin.id,
            type: NotificationType.ReplenishmentReady,
            title: testTitle(`page-${i}`),
            body: 'x',
          }),
        ),
      );
    }
    const readRes = await request(`/notifications/${rows[0]!.id}/read`, {
      method: 'POST',
      headers: authHeader(token),
    });
    expect(readRes.status).toBe(200);

    const unreadRes = await request('/notifications?status=unread', {
      headers: authHeader(token),
    });
    const unreadBody = await json<ListBody>(unreadRes);
    expect(unreadBody.total).toBe(2);
    expect(unreadBody.items.every((i) => i.status === 'unread')).toBe(true);

    const pagedRes = await request('/notifications?page=1&limit=2', {
      headers: authHeader(token),
    });
    const pagedBody = await json<ListBody>(pagedRes);
    expect(pagedBody.items).toHaveLength(2);
    expect(pagedBody.total).toBe(3);
    expect(pagedBody.limit).toBe(2);
  });
});

describe('POST /notifications/:id/read', () => {
  test('marks own row read, stamps read_at once, and is idempotent', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const [row] = track(
      await notify(db(), {
        recipientUserId: admin.id,
        type: NotificationType.ReplenishmentReady,
        title: testTitle('read'),
        body: 'x',
      }),
    );

    const first = await request(`/notifications/${row!.id}/read`, {
      method: 'POST',
      headers: authHeader(token),
    });
    expect(first.status).toBe(200);
    const firstBody = await json<{ notification: NotificationView }>(first);
    expect(firstBody.notification.status).toBe('read');
    expect(firstBody.notification.readAt).not.toBeNull();

    const second = await request(`/notifications/${row!.id}/read`, {
      method: 'POST',
      headers: authHeader(token),
    });
    expect(second.status).toBe(200);
    const secondBody = await json<{ notification: NotificationView }>(second);
    expect(secondBody.notification.readAt).toBe(firstBody.notification.readAt);
  });

  test('a foreign or malformed id is 404 notification_not_found', async () => {
    const { admin } = await seedAdminAndLogin();
    const { token: otherToken } = await seedTechnicianAndLogin();
    const [row] = track(
      await notify(db(), {
        recipientUserId: admin.id,
        type: NotificationType.ReplenishmentReady,
        title: testTitle('foreign'),
        body: 'x',
      }),
    );

    const foreign = await request(`/notifications/${row!.id}/read`, {
      method: 'POST',
      headers: authHeader(otherToken),
    });
    expect(foreign.status).toBe(404);
    expect(await json(foreign)).toEqual({ error: 'notification_not_found' });

    const malformed = await request('/notifications/not-a-uuid/read', {
      method: 'POST',
      headers: authHeader(otherToken),
    });
    expect(malformed.status).toBe(404);
    expect(await json(malformed)).toEqual({ error: 'notification_not_found' });

    // The foreign attempt must not have flipped the owner's row.
    const [kept] = await db()
      .select()
      .from(notifications)
      .where(eq(notifications.id, row!.id));
    expect(kept!.status).toBe('unread');
  });
});

describe('POST /notifications/read-all', () => {
  test('flips only the caller\'s unread rows', async () => {
    const { admin, token } = await seedAdminAndLogin();
    const { tech, token: techToken } = await seedTechnicianAndLogin();

    const adminRows: NotificationRow[] = [];
    for (let i = 0; i < 3; i++) {
      adminRows.push(
        ...track(
          await notify(db(), {
            recipientUserId: admin.id,
            type: NotificationType.ReplenishmentReady,
            title: testTitle(`readall-${i}`),
            body: 'x',
          }),
        ),
      );
    }
    track(
      await notify(db(), {
        recipientUserId: tech.id,
        type: NotificationType.ReplenishmentRejected,
        title: testTitle('readall-tech'),
        body: 'x',
      }),
    );
    // One of the admin's rows is already read — read-all only counts unread.
    await request(`/notifications/${adminRows[0]!.id}/read`, {
      method: 'POST',
      headers: authHeader(token),
    });

    const res = await request('/notifications/read-all', {
      method: 'POST',
      headers: authHeader(token),
    });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ updated: 2 });

    const listBody = await json<ListBody>(
      await request('/notifications', { headers: authHeader(token) }),
    );
    expect(listBody.unreadCount).toBe(0);

    // The technician's backlog is untouched.
    const techBody = await json<ListBody>(
      await request('/notifications', { headers: authHeader(techToken) }),
    );
    expect(techBody.unreadCount).toBe(1);
  });
});

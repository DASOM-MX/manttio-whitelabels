import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { notifications } from '../models/notifications.model';
import { NotificationStatus } from '../enums/notifications.enum';
import type { NewNotification, NotificationRow, NotificationView } from '../types/notifications.types';

// Every read/mutation here is scoped to one recipient — a user only ever sees
// or flips their own rows (plan §2.2); the service never widens this.

const toView = (row: NotificationRow): NotificationView => ({
  id: row.id,
  type: row.type,
  title: row.title,
  body: row.body,
  data: row.data,
  status: row.status,
  ...(row.audienceRole ? { audienceRole: row.audienceRole } : {}),
  readAt: row.readAt,
  createdAt: row.createdAt,
});

/** One batch insert for the whole fan-out — a role broadcast is a single
 *  atomic statement, not N round trips (the shared dev DB holds hundreds of
 *  accumulated fixture users per role, and even in production a broadcast
 *  should not partially land). */
export const insertNotifications = async (
  db: Db,
  values: NewNotification[],
): Promise<NotificationRow[]> => {
  if (values.length === 0) return [];
  return db.insert(notifications).values(values).returning();
};

export const countUnread = async (db: Db, recipientUserId: string): Promise<number> => {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientUserId, recipientUserId),
        eq(notifications.status, NotificationStatus.Unread),
      ),
    );
  return rows[0]?.count ?? 0;
};

/** Paged, newest-first list for one recipient, with the badge count folded in
 *  (the one-shot read the bell opens with — plan §2.2). */
export const listNotifications = async (
  db: Db,
  recipientUserId: string,
  page: number,
  limit: number,
  status?: NotificationStatus,
): Promise<{ items: NotificationView[]; total: number; unreadCount: number }> => {
  const scope = status
    ? and(eq(notifications.recipientUserId, recipientUserId), eq(notifications.status, status))
    : eq(notifications.recipientUserId, recipientUserId);

  const rows = await db
    .select()
    .from(notifications)
    .where(scope)
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(scope);

  return {
    items: rows.map(toView),
    total: countRows[0]?.count ?? 0,
    unreadCount: await countUnread(db, recipientUserId),
  };
};

/** Mark one row read. Idempotent: an already-read row matches and keeps its
 *  original read_at. Returns null when the id is missing or foreign. */
export const markRead = async (
  db: Db,
  recipientUserId: string,
  id: string,
): Promise<NotificationView | null> => {
  const [row] = await db
    .update(notifications)
    .set({ status: NotificationStatus.Read, readAt: sql`coalesce(${notifications.readAt}, now())` })
    .where(and(eq(notifications.id, id), eq(notifications.recipientUserId, recipientUserId)))
    .returning();
  return row ? toView(row) : null;
};

/** Flip every unread row of the caller. Returns how many flipped. */
export const markAllRead = async (db: Db, recipientUserId: string): Promise<number> => {
  const rows = await db
    .update(notifications)
    .set({ status: NotificationStatus.Read, readAt: new Date() })
    .where(
      and(
        eq(notifications.recipientUserId, recipientUserId),
        eq(notifications.status, NotificationStatus.Unread),
      ),
    )
    .returning({ id: notifications.id });
  return rows.length;
};

// The notification module's business logic (plan §2.1). Domain modules call
// notify() in-process — creation is server-internal only; clients only read,
// mark read, and (CP-2) stream. The module resolves a role to its active
// users but never decides *who should care* — recipient policy stays with
// the caller.

import type { SSEStreamingApi } from 'hono/streaming';
import type { Db } from '../../database/client';
import { findUserById, listActiveUsersByRoles } from '../../users/repository/users.repository';
import {
  countUnread,
  insertNotifications,
  listCreatedAfter,
  listNotifications,
  markAllRead,
  markRead,
  streamCursorStart,
} from '../repository/notifications.repository';
import {
  NOTIFICATIONS_STREAM_HEARTBEAT_MS,
  NOTIFICATIONS_STREAM_POLL_MS,
} from '../constants/stream-timing';
import { NotificationNotFoundError } from '../http-errors/notification-not-found.error';
import type { ListNotificationsQuery } from '../validators/notifications.validator';
import type {
  NotificationQueryResponse,
  NotificationRow,
  NotificationView,
  NotifyInput,
} from '../types/notifications.types';

/** The one entry point callers use. Resolves recipients (direct user wins
 *  over role broadcast), then inserts one per-user row — the insert alone
 *  makes it live (the SSE stream re-reads rows; the DB row is the truth).
 *  Returns one row per resolved recipient. Best-effort on resolution: an
 *  unknown/soft-deleted direct recipient or a role with no active users
 *  yields zero rows and a log line, never an error. Neither `recipientUserId`
 *  nor `role` given is a programmer error and throws. */
export const notify = async (db: Db, input: NotifyInput): Promise<NotificationRow[]> => {
  if (!input.recipientUserId && !input.role) {
    throw new Error('notify() requires a recipientUserId or a role');
  }

  // Direct addressing takes precedence; `role` is only the fallback (§0).
  let recipients;
  if (input.recipientUserId) {
    const user = await findUserById(db, input.recipientUserId);
    if (!user) {
      console.warn(`notify: recipient '${input.recipientUserId}' not found or inactive — skipped`);
      return [];
    }
    recipients = [user];
  } else {
    const roles = Array.isArray(input.role) ? input.role : [input.role!];
    // One IN query — a user holds a single role, so multi-role input dedupes
    // naturally (each user matches at most once).
    recipients = await listActiveUsersByRoles(db, roles);
    if (recipients.length === 0) {
      console.warn(`notify: role broadcast [${roles.join(', ')}] resolved no active users — skipped`);
      return [];
    }
  }

  // The actor never hears about their own action; resolving to nobody after
  // the drop is the same best-effort skip as an empty role.
  if (input.excludeUserId) {
    recipients = recipients.filter((r) => r.id !== input.excludeUserId);
    if (recipients.length === 0) return [];
  }

  return insertNotifications(
    db,
    recipients.map((recipient) => ({
      recipientUserId: recipient.id,
      // Provenance only on broadcasts — null when addressed directly.
      audienceRole: input.recipientUserId ? null : recipient.role,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data ?? {},
    })),
  );
};

/** For fire-and-forget domain triggers (report/customer lifecycle events): a
 *  notification failure must never break the flow that caused it — same
 *  best-effort class as the auto-email on report finish. */
export const notifyBestEffort = async (db: Db, input: NotifyInput): Promise<void> => {
  try {
    await notify(db, input);
  } catch (err) {
    console.error('notify failed (best-effort):', err);
  }
};

export const getNotifications = (
  db: Db,
  userId: string,
  query: ListNotificationsQuery,
): Promise<NotificationQueryResponse> =>
  listNotifications(db, userId, query.page, query.limit, query.status);

/** Idempotent; a missing or foreign id throws NotificationNotFoundError. */
export const markNotificationRead = async (
  db: Db,
  userId: string,
  id: string,
): Promise<NotificationView> => {
  const view = await markRead(db, userId, id);
  if (!view) throw new NotificationNotFoundError(id);
  return view;
};

export const markAllNotificationsRead = (db: Db, userId: string) => markAllRead(db, userId);

/** The session-length SSE loop (plan §2.2). On connect: the current
 *  unread-count. Then every ~2 s: re-read rows created after the cursor and
 *  emit a `notification` event per new row (the full view, so the bell
 *  prepends without a refetch) plus an `unread-count` event when the count
 *  changed; a comment heartbeat every 15 s. No terminal event — a user's
 *  feed has no end; the loop runs until the client disconnects. The DB row
 *  is the truth (no in-process pub/sub — isolates don't share memory). */
export const streamNotificationEvents = async (
  db: Db,
  userId: string,
  stream: SSEStreamingApi,
): Promise<void> => {
  let cursor = await streamCursorStart(db);
  let lastCount = await countUnread(db, userId);
  await stream.writeSSE({ event: 'unread-count', data: String(lastCount) });

  let lastHeartbeat = Date.now();
  while (!stream.aborted) {
    await stream.sleep(NOTIFICATIONS_STREAM_POLL_MS);
    if (stream.aborted) break;

    const fresh = await listCreatedAfter(db, userId, cursor);
    for (const view of fresh) {
      if (view.createdAt > cursor) cursor = view.createdAt;
      await stream.writeSSE({ event: 'notification', data: JSON.stringify(view) });
    }

    const count = await countUnread(db, userId);
    if (count !== lastCount) {
      lastCount = count;
      await stream.writeSSE({ event: 'unread-count', data: String(count) });
    }

    if (Date.now() - lastHeartbeat >= NOTIFICATIONS_STREAM_HEARTBEAT_MS) {
      lastHeartbeat = Date.now();
      // SSE comment line — keeps proxies from idling the connection out.
      await stream.write(': heartbeat\n\n');
    }
  }
};

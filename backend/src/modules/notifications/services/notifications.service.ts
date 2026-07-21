// The notification module's business logic (plan §2.1). Domain modules call
// notify() in-process — creation is server-internal only; clients only read,
// mark read, and (CP-2) stream. The module resolves a role to its active
// users but never decides *who should care* — recipient policy stays with
// the caller.

import type { Db } from '../../database/client';
import { findUserById, listActiveUsersByRoles } from '../../users/repository/users.repository';
import {
  insertNotifications,
  listNotifications,
  markAllRead,
  markRead,
} from '../repository/notifications.repository';
import { NotificationNotFoundError } from '../http-errors/notification-not-found.error';
import type { ListNotificationsQuery } from '../validators/notifications.validator';
import type { NotificationRow, NotificationView, NotifyInput } from '../types/notifications.types';

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

export const getNotifications = (db: Db, userId: string, query: ListNotificationsQuery) =>
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

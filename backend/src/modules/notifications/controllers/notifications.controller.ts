import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { requireRole } from '../../auth/middleware/roles.middleware';
import {
  listNotificationsQuerySchema,
  sendNotificationSchema,
} from '../validators/notifications.validator';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notify,
  streamNotificationEvents,
} from '../services/notifications.service';
import { NotificationType } from '../enums/notifications.enum';
import { NotificationNotFoundError } from '../http-errors/notification-not-found.error';

// Read/mark endpoints are scoped to the authenticated user server-side — a
// user only ever sees / mutates their own rows, so they carry no role gate
// (plan §2.2). A foreign id yields 404 notification_not_found, never another
// user's data. Creation stays server-internal (domain modules call notify()
// in-process) with ONE exception: POST / lets an owner author an explicit
// `announcement` send (owner decision, 2026-07-20 — plan §0). No DELETE
// (retention is the only remover).
export const notifications = new Hono<AppBindings>();

const idSchema = z.string().uuid();

// The one-shot read the bell opens with (and the SSE reconnect re-syncs
// from): paged, newest first, badge count folded in.
notifications.get('/', zValidator('query', listNotificationsQuerySchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const { page, limit, status } = c.req.valid('query');
  const { items, total, unreadCount } = await getNotifications(db, c.get('user').id, {
    page,
    limit,
    status,
  });
  return c.json({ items, total, unreadCount, page, limit });
});

// Live delivery (plan §2.2): session-length per-user SSE — stays open until
// the client disconnects (no terminal event, unlike the WMS import stream).
// Bearer-authed by the mounted JWT middleware like every sibling route; the
// frontend consumes it with the fetch-based reader (EventSource can't set
// the Authorization header).
notifications.get('/stream', (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const userId = c.get('user').id;
  return streamSSE(c, (stream) => streamNotificationEvents(db, userId, stream));
});

// Owner-authored explicit send — the only client-facing create. The type is
// stamped server-side (`announcement`): API callers never mint system types,
// those stay reserved for in-code notify() callers.
notifications.post('/', requireRole(['owner']), zValidator('json', sendNotificationSchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const input = c.req.valid('json');
  const rows = await notify(db, {
    recipientUserId: input.recipientUserId,
    role: input.role,
    type: NotificationType.Announcement,
    title: input.title,
    body: input.body,
    data: input.data,
  });
  // notify() log-and-skips an unknown direct recipient (fine for in-code
  // callers); an explicit API send surfaces it instead.
  if (input.recipientUserId && rows.length === 0) {
    return c.json({ error: 'recipient_not_found' }, 404);
  }
  return c.json({ created: rows.length }, 201);
});

notifications.post('/read-all', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const updated = await markAllNotificationsRead(db, c.get('user').id);
  return c.json({ updated });
});

notifications.post('/:id/read', async (c) => {
  const id = c.req.param('id');
  // A malformed id is indistinguishable from a missing row to the client.
  if (!idSchema.safeParse(id).success) {
    return c.json({ error: 'notification_not_found' }, 404);
  }
  const db = createDb(c.env.DATABASE_URL);
  try {
    const notification = await markNotificationRead(db, c.get('user').id, id);
    return c.json({ notification });
  } catch (err) {
    if (err instanceof NotificationNotFoundError) {
      return c.json({ error: 'notification_not_found' }, 404);
    }
    throw err;
  }
});

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { listNotificationsQuerySchema } from '../validators/notifications.validator';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notifications.service';
import { NotificationNotFoundError } from '../http-errors/notification-not-found.error';

// Every endpoint is scoped to the authenticated user server-side — a user
// only ever sees / mutates their own rows, so there is no role gate (plan
// §2.2). A foreign id yields 404 notification_not_found, never another
// user's data. No POST / (creation is server-internal) and no DELETE
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

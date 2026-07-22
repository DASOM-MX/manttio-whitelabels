import type { NotificationListQuery } from '../../app/data/dtos/notification';

export class LoadNotifications {
  static readonly type = '[Notifications] Load';
  constructor(public query: NotificationListQuery = {}) {}
}

/** Open the session-length feed: one-shot list first (instant render), then
 *  the SSE stream with capped-backoff reconnect (plan §3.2). */
export class ListenNotifications {
  static readonly type = '[Notifications] Listen';
}

/** Shell teardown (DestroyRef) — closes the stream. */
export class StopListeningNotifications {
  static readonly type = '[Notifications] Stop Listening';
}

export class MarkRead {
  static readonly type = '[Notifications] Mark Read';
  constructor(public id: string) {}
}

export class MarkAllRead {
  static readonly type = '[Notifications] Mark All Read';
}

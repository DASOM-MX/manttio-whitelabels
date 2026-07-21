import type { notifications } from '../models/notifications.model';
import type { Role } from '../../users/enums/users.enum';
import type { NotificationType } from '../enums/notifications.enum';

export type NotificationRow = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

// The one entry point callers use (plan §2.1). Callers decide who / what;
// the module owns persist → fan out → live-push → retain. `recipientUserId`
// takes precedence; `role` is the fallback broadcast — resolved to every
// active user of the role(s) at creation time. Neither given is a programmer
// error (throws). A `channels` option joins this input when the email channel
// is wired (deferred — owner, 2026-07-20; v1 is in-app only).
export type NotifyInput = {
  recipientUserId?: string;
  role?: Role | Role[];
  /** The acting user, when the event is their own doing — dropped from the
   *  resolved recipients so nobody is notified of their own action (plan
   *  "actor self-notification", resolved 2026-07-21). */
  excludeUserId?: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

// What clients see on GET /notifications.
export type NotificationView = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  status: NotificationRow['status'];
  audienceRole?: Role;
  readAt: Date | null;
  createdAt: Date;
};

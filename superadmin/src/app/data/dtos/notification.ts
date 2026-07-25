/** Notification DTOs (notifications plan §3.3) — string-literal unions kept
 *  in sync with the backend enums (`notifications/enums/notifications.enum.ts`,
 *  CHECK-narrowed in the table). */

import type { Role } from './auth';

export type NotificationType =
  | 'replenishment_ready'
  | 'replenishment_failed'
  | 'replenishment_rejected'
  | 'announcement'
  | 'report_created'
  | 'report_finalized'
  | 'client_registered_from_website'
  | 'client_registered_from_superadmin'
  | 'client_blacklisted'
  | 'client_updated'
  | 'client_archived'
  | 'client_interaction_registered';

export type NotificationStatus = 'unread' | 'read';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Deep-link payload — the router target is built from this + `type`. */
  data: Record<string, unknown>;
  status: NotificationStatus;
  /** Present on role-broadcast copies (cosmetic "para administradores" tag). */
  audienceRole?: Role;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListQuery {
  page?: number;
  limit?: number;
  status?: NotificationStatus;
}

/** `GET /notifications` — paged, newest first, badge count folded in. */
export interface NotificationListResponse {
  items: Notification[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
}

/** One parsed frame off `GET /notifications/stream`: `notification` carries a
 *  full Notification; `unread-count` carries a number. */
export type NotificationStreamEvent =
  | { event: 'notification'; data: Notification }
  | { event: 'unread-count'; data: number };

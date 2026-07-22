import { Pipe, PipeTransform } from '@angular/core';
import type { LucideIcon } from '@lucide/angular';
import { NOTIFICATION_TYPE_ICONS } from '../model/constants/notification/notification-type-icons.const';
import type { Notification, NotificationType } from '../data/dtos/notification';

// No type→label map on purpose: the display text IS the server-authored
// `title`/`body` (already Spanish). The type only drives icon + deep link.

@Pipe({ name: 'notificationTypeIcon' })
export class NotificationTypeIconPipe implements PipeTransform {
  transform(type: NotificationType): LucideIcon | null {
    return NOTIFICATION_TYPE_ICONS[type] ?? null;
  }
}

/** Router target for a notification (plan §3.3): an internal `data.link`
 *  wins; otherwise known types derive from their payload ids; null = the
 *  row isn't navigable (mark-read only). Plain function so click handlers
 *  share it with the pure pipe. */
export const notificationRoute = (n: Notification): string | null => {
  const link = n.data['link'];
  if (typeof link === 'string' && link.startsWith('/')) return link;
  if (
    (n.type === 'report_created' || n.type === 'report_finalized') &&
    typeof n.data['reportId'] === 'string'
  ) {
    return `/reports/${n.data['reportId']}`;
  }
  if (n.type.startsWith('client_') && typeof n.data['customerId'] === 'string') {
    return `/customers/${n.data['customerId']}`;
  }
  return null;
};

@Pipe({ name: 'notificationRoute' })
export class NotificationRoutePipe implements PipeTransform {
  transform(n: Notification): string | null {
    return notificationRoute(n);
  }
}

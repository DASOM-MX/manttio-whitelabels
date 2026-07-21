import { Component, DestroyRef, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Popover, PopoverModule } from 'primeng/popover';
import { LucideBell, LucideBellOff, LucideDynamicIcon } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { NotificationsState } from '../../../../state/notifications/notifications.state';
import {
  ListenNotifications,
  MarkAllRead,
  MarkRead,
  StopListeningNotifications,
} from '../../../../state/notifications/notifications.actions';
import { RelativeTimePipe } from '../../../pipes/relative-time.pipe';
import {
  NotificationTypeIconPipe,
  notificationRoute,
} from '../../../pipes/notification.pipe';
import type { Notification } from '../../../data/dtos/notification';

/** How many rows the panel shows — it's a recency surface, not a history
 *  page (a full /notifications page is deferred, plan §3.3). */
const PANEL_LIMIT = 15;

/** The topbar bell (plan §3.3): unread badge + a dense recent-notifications
 *  panel. Mounted once in the authenticated layout, so the SSE feed opens at
 *  shell init and closes on shell teardown. */
@Component({
  selector: 'app-notification-center',
  imports: [PopoverModule, LucideBell, LucideBellOff, LucideDynamicIcon, RelativeTimePipe, NotificationTypeIconPipe],
  templateUrl: './notification-center.html',
})
export class NotificationCenter {
  private readonly store = inject(Store);
  private readonly router = inject(Router);

  protected unreadCount = select(NotificationsState.unreadCount);
  private list = select(NotificationsState.list);

  /** Panel view-model — templates read plain data (no inline checks). */
  protected recent = computed(() =>
    this.list()
      .slice(0, PANEL_LIMIT)
      .map((n) => ({ n, unread: n.status === 'unread' })),
  );
  protected badgeText = computed(() => {
    const count = this.unreadCount();
    return count > 99 ? '99+' : String(count);
  });
  protected bellAria = computed(() => {
    const count = this.unreadCount();
    return count > 0 ? `Notificaciones, ${count} sin leer` : 'Notificaciones';
  });
  protected hasUnread = computed(() => this.unreadCount() > 0);

  constructor() {
    this.store.dispatch(new ListenNotifications());
    inject(DestroyRef).onDestroy(() => this.store.dispatch(new StopListeningNotifications()));
  }

  protected markAllRead(): void {
    this.store.dispatch(new MarkAllRead());
  }

  protected onItemClick(n: Notification, panel: Popover): void {
    if (n.status === 'unread') this.store.dispatch(new MarkRead(n.id));
    const route = notificationRoute(n);
    if (route) {
      panel.hide();
      this.router.navigateByUrl(route);
    }
  }
}

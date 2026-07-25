import { Injectable, inject } from '@angular/core';
import { Actions, Action, ofActionDispatched, Selector, State, StateContext, Store } from '@ngxs/store';
import { defer, EMPTY, repeat, retry, switchMap, takeUntil, tap, timer } from 'rxjs';
import { NotificationsService } from '../../app/services/http/notifications.service';
import { AuthState } from '../auth/auth.state';
import {
  ListenNotifications,
  LoadNotifications,
  MarkAllRead,
  MarkRead,
  StopListeningNotifications,
} from './notifications.actions';
import type { SseEvent } from '../../app/services/sse';
import type { Notification, NotificationListQuery } from '../../app/data/dtos/notification';

export interface NotificationsStateModel {
  /** Newest first — the panel's list. */
  list: Notification[];
  unreadCount: number;
  total: number;
  loading: boolean;
}

/** Reconnect backoff: 1 s → capped 5 s (plan §3.2 — same shape WMS uses). */
const RECONNECT_CAP_MS = 5_000;
const RECONNECT_STEP_MS = 1_000;

@State<NotificationsStateModel>({
  name: 'notifications',
  defaults: { list: [], unreadCount: 0, total: 0, loading: false },
})
@Injectable()
export class NotificationsState {
  private readonly api = inject(NotificationsService);
  private readonly store = inject(Store);
  private readonly actions$ = inject(Actions);

  @Selector() static list(s: NotificationsStateModel): Notification[] {
    return s.list;
  }
  @Selector() static unreadCount(s: NotificationsStateModel): number {
    return s.unreadCount;
  }
  @Selector() static loading(s: NotificationsStateModel): boolean {
    return s.loading;
  }

  @Action(LoadNotifications)
  load(ctx: StateContext<NotificationsStateModel>, { query }: LoadNotifications) {
    return this.loadOnce(ctx, query);
  }

  /** Session-length subscription — NO terminal completion by design. `retry`
   *  resubscribes the whole `defer`, so every reconnect re-syncs from the
   *  one-shot GET before re-opening the stream (plan §3.2). Stopped only by
   *  StopListeningNotifications (shell teardown) or a re-dispatch
   *  (`cancelUncompleted`). */
  @Action(ListenNotifications, { cancelUncompleted: true })
  listen(ctx: StateContext<NotificationsStateModel>) {
    return defer(() => this.loadOnce(ctx)).pipe(
      switchMap(() => {
        const token = this.store.selectSnapshot(AuthState.token);
        // No token means the shell is tearing down around us — stay silent.
        return token ? this.api.stream(token) : EMPTY;
      }),
      tap((evt) => this.applyStreamEvent(ctx, evt)),
      // A server that ENDS the stream cleanly (proxy idle-close, deploy) and
      // one that errors both reconnect with the same capped backoff.
      repeat({
        delay: (count) => timer(Math.min(RECONNECT_CAP_MS, RECONNECT_STEP_MS * count)),
      }),
      retry({
        delay: (_err, retryCount) =>
          timer(Math.min(RECONNECT_CAP_MS, RECONNECT_STEP_MS * retryCount)),
      }),
      takeUntil(this.actions$.pipe(ofActionDispatched(StopListeningNotifications))),
    );
  }

  @Action(MarkRead)
  markRead(ctx: StateContext<NotificationsStateModel>, { id }: MarkRead) {
    return this.api.markRead(id).pipe(
      tap(({ notification }) => {
        const s = ctx.getState();
        const wasUnread = s.list.find((n) => n.id === id)?.status === 'unread';
        ctx.patchState({
          list: s.list.map((n) => (n.id === id ? notification : n)),
          unreadCount: wasUnread ? Math.max(0, s.unreadCount - 1) : s.unreadCount,
        });
      }),
    );
  }

  @Action(MarkAllRead)
  markAllRead(ctx: StateContext<NotificationsStateModel>) {
    return this.api.markAllRead().pipe(
      tap(() => {
        const now = new Date().toISOString();
        ctx.patchState({
          list: ctx
            .getState()
            .list.map((n) =>
              n.status === 'unread' ? { ...n, status: 'read' as const, readAt: n.readAt ?? now } : n,
            ),
          unreadCount: 0,
        });
      }),
    );
  }

  /** One-shot GET — instant render on open + the re-sync every reconnect
   *  starts from. */
  private loadOnce(ctx: StateContext<NotificationsStateModel>, query: NotificationListQuery = {}) {
    ctx.patchState({ loading: true });
    return this.api.list(query).pipe(
      tap({
        next: ({ items, total, unreadCount }) =>
          ctx.patchState({ list: items, total, unreadCount, loading: false }),
        error: () => ctx.patchState({ loading: false }),
      }),
    );
  }

  private applyStreamEvent(
    ctx: StateContext<NotificationsStateModel>,
    evt: SseEvent<unknown>,
  ): void {
    if (evt.event === 'notification') {
      const incoming = evt.data as Notification;
      const s = ctx.getState();
      if (s.list.some((n) => n.id === incoming.id)) return;
      ctx.patchState({ list: [incoming, ...s.list], total: s.total + 1 });
    } else if (evt.event === 'unread-count') {
      ctx.patchState({ unreadCount: Number(evt.data) });
    }
  }
}

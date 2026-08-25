import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { RemoteService } from './remote.service';
import { sseStream } from '../sse';
import type { SseEvent } from '../sse';
import type {
  Notification,
  NotificationListQuery,
  NotificationQueryResponse,
} from '../../data/dtos/notification';

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly remote = inject(RemoteService);
  private readonly base = environment.apiUrl.replace(/\/$/, '');

  list(query: NotificationListQuery = {}): Observable<NotificationQueryResponse> {
    return this.remote.get<NotificationQueryResponse>('/notifications', {
      page: query.page,
      limit: query.limit,
      status: query.status,
    });
  }

  markRead(id: string): Observable<{ notification: Notification }> {
    return this.remote.post<{ notification: Notification }>(`/notifications/${id}/read`, {});
  }

  markAllRead(): Observable<{ updated: number }> {
    return this.remote.post<{ updated: number }>('/notifications/read-all', {});
  }

  /** The session-length SSE feed (plan §3.1/§3.2). The caller supplies the
   *  Bearer token — the HTTP interceptor can't reach a raw fetch. Emitted
   *  frames are `notification` (a full row) and `unread-count` (a number);
   *  the state narrows by event name. */
  stream(token: string): Observable<SseEvent<unknown>> {
    return sseStream<unknown>(`${this.base}/notifications/stream`, token);
  }
}

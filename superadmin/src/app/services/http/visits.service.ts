import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import { sseStream } from '../sse';
import type { SseEvent } from '../sse';
import type {
  AssignVisitRequest,
  CloseVisitRequest,
  CorrectVisitActualsRequest,
  CorrectVisitRequest,
  CreateVisitRequest,
  RescheduleVisitRequest,
  RespondVisitRequest,
  Visit,
  VisitListQuery,
  VisitStreamFrame,
} from '../../data/dtos/visit';

@Injectable({ providedIn: 'root' })
export class VisitsService {
  private readonly remote = inject(RemoteService);

  /** A bounded window or a code prefix, not a paged list — the calendar loads
   *  whole weeks, the search box loads one code. The API 400s if neither is
   *  supplied, so a caller must always narrow. */
  list(query: VisitListQuery): Observable<Visit[]> {
    return this.remote.get<Visit[]>('/visits', {
      from: query.from,
      to: query.to,
      internalCode: query.internalCode,
      technicianId: query.technicianId,
      customerId: query.customerId,
      status: query.status,
    });
  }

  get(id: string): Observable<Visit> {
    return this.remote.get<Visit>(`/visits/${id}`);
  }

  /** Live lifecycle frames (12 CP-4) — the calendar page's subscription. Same
   *  posture as the notifications stream: the fetch-based reader takes the
   *  absolute URL and the Bearer token explicitly, because EventSource can't
   *  set headers and the interceptor never sees this request. */
  stream(token: string): Observable<SseEvent<VisitStreamFrame>> {
    return sseStream<VisitStreamFrame>(this.remote.url('/visits/stream'), token);
  }

  create(body: CreateVisitRequest): Observable<Visit> {
    return this.remote.post<Visit>('/visits', body);
  }

  /** Open-visit correction — 409 once the visit is in progress or terminal. */
  correct(id: string, body: CorrectVisitRequest): Observable<Visit> {
    return this.remote.patch<Visit>(`/visits/${id}`, body);
  }

  assign(id: string, body: AssignVisitRequest): Observable<Visit> {
    return this.remote.post<Visit>(`/visits/${id}/assign`, body);
  }

  respond(id: string, body: RespondVisitRequest): Observable<Visit> {
    return this.remote.post<Visit>(`/visits/${id}/respond`, body);
  }

  /** Owner/admin only, terminal visits only — the one edit past a terminal
   *  state (12 §2). 403 for office, 409 while the visit is still open. */
  correctActuals(id: string, body: CorrectVisitActualsRequest): Observable<Visit> {
    return this.remote.patch<Visit>(`/visits/${id}/actuals`, body);
  }

  close(id: string, body: CloseVisitRequest): Observable<Visit> {
    return this.remote.post<Visit>(`/visits/${id}/close`, body);
  }

  /** Returns the **successor** — the closed visit stays as it was. */
  reschedule(id: string, body: RescheduleVisitRequest): Observable<Visit> {
    return this.remote.post<Visit>(`/visits/${id}/reschedule`, body);
  }
}

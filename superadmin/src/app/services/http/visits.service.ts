import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type {
  AssignVisitRequest,
  CloseVisitRequest,
  CorrectVisitRequest,
  CreateVisitRequest,
  RescheduleVisitRequest,
  RespondVisitRequest,
  Visit,
  VisitListQuery,
} from '../../data/dtos/visit';

@Injectable({ providedIn: 'root' })
export class VisitsService {
  private readonly remote = inject(RemoteService);

  /** A bounded window, not a paged list — the calendar loads whole weeks. */
  list(query: VisitListQuery): Observable<Visit[]> {
    return this.remote.get<Visit[]>('/visits', {
      from: query.from,
      to: query.to,
      technicianId: query.technicianId,
      customerId: query.customerId,
      status: query.status,
    });
  }

  get(id: string): Observable<Visit> {
    return this.remote.get<Visit>(`/visits/${id}`);
  }

  create(body: CreateVisitRequest): Observable<Visit> {
    return this.remote.post<Visit>('/visits', body);
  }

  /** Open-visit correction only — 409 once terminal. */
  correct(id: string, body: CorrectVisitRequest): Observable<Visit> {
    return this.remote.patch<Visit>(`/visits/${id}`, body);
  }

  assign(id: string, body: AssignVisitRequest): Observable<Visit> {
    return this.remote.post<Visit>(`/visits/${id}/assign`, body);
  }

  respond(id: string, body: RespondVisitRequest): Observable<Visit> {
    return this.remote.post<Visit>(`/visits/${id}/respond`, body);
  }

  close(id: string, body: CloseVisitRequest): Observable<Visit> {
    return this.remote.post<Visit>(`/visits/${id}/close`, body);
  }

  /** Returns the **successor** — the closed visit stays as it was. */
  reschedule(id: string, body: RescheduleVisitRequest): Observable<Visit> {
    return this.remote.post<Visit>(`/visits/${id}/reschedule`, body);
  }
}

import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type {
  CloseVisitRequest, RespondVisitRequest, StartVisitRequest,
  Visit, VisitListQuery,
} from '../app/data/dtos/visit';

@Injectable({ providedIn: 'root' })
export class VisitsService {
  private readonly remote = inject(RemoteService);

  list(query: VisitListQuery): Observable<Visit[]> {
    return this.remote.get<Visit[]>('/visits', { ...query });
  }
  get(id: string): Observable<Visit> {
    return this.remote.get<Visit>(`/visits/${id}`);
  }
  /** Iniciar — stamps the tap time and moves the visit to `in_progress` (or
   *  backfills a missing start on a terminal visit when the tap synced late). */
  start(id: string, body: StartVisitRequest): Observable<Visit> {
    return this.remote.post<Visit>(`/visits/${id}/start`, body);
  }
  /** Terminar — the visit was served. */
  respond(id: string, body: RespondVisitRequest): Observable<Visit> {
    return this.remote.post<Visit>(`/visits/${id}/respond`, body);
  }
  /** Cerrar — not served, with a categorized reason. */
  close(id: string, body: CloseVisitRequest): Observable<Visit> {
    return this.remote.post<Visit>(`/visits/${id}/close`, body);
  }
}

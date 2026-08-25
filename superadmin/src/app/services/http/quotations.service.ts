import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type { GenericQueryResponse } from '../../data/dtos/generic-query-response';
import type { QuotationDetail, QuotationSummary } from '../../data/dtos/quotation/quotation';
import type { QuotationEvent } from '../../data/dtos/quotation/quotation-event';
import type {
  CancelQuotationRequest,
  QuotationSettings,
  CreateQuotationRequest,
  DeleteQuotationRequest,
  QuotationListQuery,
  SendQuotationRequest,
  SendQuotationResult,
  UpdateQuotationRequest,
} from '../../data/dtos/quotation/quotation-requests';

@Injectable({ providedIn: 'root' })
export class QuotationsService {
  private readonly remote = inject(RemoteService);

  list(query: QuotationListQuery): Observable<GenericQueryResponse<QuotationSummary>> {
    return this.remote.get<GenericQueryResponse<QuotationSummary>>('/quotations', {
      q: query.q,
      customerId: query.customerId,
      status: query.status,
      due: query.due,
      page: query.page,
      limit: query.limit,
    });
  }

  /** The client's quotations, for the customer view's card. A dedicated route
   *  rather than `list({ customerId })`: the client is the path, so it cannot
   *  be dropped or contradicted by a stray filter, and an unknown client 404s
   *  instead of returning an empty list. */
  listForCustomer(
    customerId: string,
    query: { page?: number; limit?: number } = {},
  ): Observable<GenericQueryResponse<QuotationSummary>> {
    return this.remote.get<GenericQueryResponse<QuotationSummary>>(
      `/customers/${customerId}/quotations`,
      { page: query.page, limit: query.limit },
    );
  }

  getSettings(): Observable<QuotationSettings> {
    return this.remote.get<QuotationSettings>('/quotations/settings');
  }

  /** Owner/admin — the default terms speak for the tenant. */
  saveSettings(body: QuotationSettings): Observable<QuotationSettings> {
    return this.remote.put<QuotationSettings>('/quotations/settings', body);
  }

  /** Nudge one pending reviewer — same token, reminder email. */
  remind(id: string, contactId: string): Observable<{ email: string }> {
    return this.remote.post<{ email: string }>(`/quotations/${id}/remind`, { contactId });
  }

  get(id: string): Observable<QuotationDetail> {
    return this.remote.get<QuotationDetail>(`/quotations/${id}`);
  }

  timeline(id: string): Observable<QuotationEvent[]> {
    return this.remote.get<QuotationEvent[]>(`/quotations/${id}/timeline`);
  }

  create(body: CreateQuotationRequest): Observable<QuotationDetail> {
    return this.remote.post<QuotationDetail>('/quotations', body);
  }

  /** Draft only — 409 once the quote has been sent. */
  update(id: string, body: UpdateQuotationRequest): Observable<QuotationDetail> {
    return this.remote.patch<QuotationDetail>(`/quotations/${id}`, body);
  }

  send(id: string, body: SendQuotationRequest): Observable<SendQuotationResult> {
    return this.remote.post<SendQuotationResult>(`/quotations/${id}/send`, body);
  }

  /** Opens a **new** linked draft and cancels this one — never edits in place,
   *  so a link the client already holds keeps resolving to what they were sent. */
  revise(id: string): Observable<QuotationDetail> {
    return this.remote.post<QuotationDetail>(`/quotations/${id}/revise`, {});
  }

  cancel(id: string, body: CancelQuotationRequest): Observable<QuotationDetail> {
    return this.remote.post<QuotationDetail>(`/quotations/${id}/cancel`, body);
  }

  remove(id: string, body: DeleteQuotationRequest): Observable<{ id: string; deleted: boolean }> {
    return this.remote.delete<{ id: string; deleted: boolean }>(`/quotations/${id}`, body);
  }
}

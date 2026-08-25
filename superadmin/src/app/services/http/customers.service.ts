import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type { GenericQueryResponse } from '../../data/dtos/generic-query-response';
import { CustomerSource, CustomerStatus } from '../../data/dtos/customer';
import type {
  Customer,
  CustomerContact,
  CustomerListQuery,
  CustomerOption,
  DeleteCustomerRequest,
  SaveCustomerRequest,
} from '../../data/dtos/customer';
import type {
  CustomerListResponse,
  CustomerResponse,
  LegacyCustomerRow,
} from '../../data/dtos/customer-legacy';
import type {
  AddInteractionRequest,
  ChangeStatusRequest,
  Interaction,
  InteractionListQuery,
} from '../../data/dtos/interaction';

@Injectable({ providedIn: 'root' })
export class CustomersService {
  private readonly remote = inject(RemoteService);

  /** The whole live roster, name-sorted — what every customer *picker* reads
   *  (21 §3). Separate from `list()` on purpose: `list()` is the paged, filtered
   *  browse for the clients page, and a picker that rides it silently shows one
   *  page of choices. Not a `GenericQueryResponse` — a roster has no page. */
  listOptions(): Observable<{ items: CustomerOption[] }> {
    return this.remote.get<{ items: CustomerOption[] }>('/customers/all');
  }

  list(query: CustomerListQuery): Observable<GenericQueryResponse<Customer>> {
    return this.remote
      .get<CustomerListResponse>('/customers', {
        page: query.page,
        limit: query.limit,
        search: query.search,
        status: query.status,
        source: query.source,
        tags: query.tags?.length ? query.tags.join(',') : undefined,
      })
      .pipe(map((res) => this.toPage(res)));
  }

  get(id: string): Observable<Customer> {
    return this.remote
      .get<CustomerResponse>(`/customers/${id}`)
      .pipe(map((res) => this.unwrap(res)));
  }

  create(body: SaveCustomerRequest): Observable<Customer> {
    return this.remote
      .post<CustomerResponse>('/customers', body)
      .pipe(map((res) => this.unwrap(res)));
  }

  update(
    id: string,
    body: Partial<SaveCustomerRequest> & { nextFollowUpAt?: string | null },
  ): Observable<Customer> {
    return this.remote
      .patch<CustomerResponse>(`/customers/${id}`, body)
      .pipe(map((res) => this.unwrap(res)));
  }

  /** Dedicated transition endpoint (08 §4) — backend audits + emits the
   *  system timeline entry, and returns the updated customer (wrapped, like the
   *  other customer writes). */
  changeStatus(id: string, body: ChangeStatusRequest): Observable<Customer> {
    return this.remote
      .post<CustomerResponse>(`/customers/${id}/status`, body)
      .pipe(map((res) => this.unwrap(res)));
  }

  /** The client's activity timeline (08 §2). Pass `refKind`/`refId` to read one
   *  linked entity's trail instead of the whole history — how a contract's
   *  audit card gets its entries (13 §6). */
  listInteractions(
    id: string,
    query: InteractionListQuery = {},
  ): Observable<GenericQueryResponse<Interaction>> {
    return this.remote.get<GenericQueryResponse<Interaction>>(`/customers/${id}/interactions`, {
      page: query.page ?? 1,
      limit: query.limit ?? 10,
      refKind: query.refKind,
      refId: query.refId,
    });
  }

  addInteraction(id: string, body: AddInteractionRequest): Observable<Interaction> {
    return this.remote.post<Interaction>(`/customers/${id}/interactions`, body);
  }

  remove(id: string, body: DeleteCustomerRequest): Observable<void> {
    return this.remote.delete<void>(`/customers/${id}`, body);
  }

  /** Persist the full contact list (backend replaces contacts wholesale on
   *  PATCH). Used by the in-view "add contact" flow so users don't have to open
   *  the edit form. */
  saveContacts(id: string, contacts: CustomerContact[]): Observable<Customer> {
    return this.remote
      .patch<CustomerResponse>(`/customers/${id}`, { contacts })
      .pipe(map((res) => this.unwrap(res)));
  }

  /** Legacy-backend interop (07 — backend customers migration pending): accept
   *  both the target paged envelope and today's `{ customers }` list, so the
   *  store always holds the target contract. */
  private toPage(res: CustomerListResponse): GenericQueryResponse<Customer> {
    if ('customers' in res) {
      const items = res.customers.map((row) => this.normalize(row));
      return { items, total: items.length, page: 1, limit: items.length };
    }
    return { ...res, items: res.items.map((row) => this.normalize(row)) };
  }

  private unwrap(res: CustomerResponse): Customer {
    return this.normalize('customer' in res ? res.customer : res);
  }

  /** Fill the CRM columns that don't exist server-side yet (defaults mirror the
   *  form's) so templates and selectors never meet undefined arrays. */
  private normalize(row: LegacyCustomerRow): Customer {
    return {
      ...row,
      tags: row.tags ?? [],
      contacts: row.contacts ?? [],
      status: row.status ?? CustomerStatus.Active,
      source: row.source ?? CustomerSource.Other,
    };
  }
}

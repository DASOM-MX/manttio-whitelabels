import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type { GenericQueryResponse } from '../../data/dtos/generic-query-response';
import type { Contract } from '../../data/dtos/contract/contract';
import type {
  ContractListQuery,
  CreateContractRequest,
  DeleteContractRequest,
  UpdateContractRequest,
} from '../../data/dtos/contract/contract-requests';

/** Both card feeds answer with a bare list under one key — they are capped,
 *  not paged, so there is no envelope to carry. */
interface ContractsResponse {
  contracts: Contract[];
}

/** Array fields cross the multipart boundary as JSON strings — the backend's
 *  create validator accepts either shape and normalizes (the reports-create
 *  precedent). */
const setJson = (fd: FormData, key: string, value: unknown[] | undefined): void => {
  if (value) fd.set(key, JSON.stringify(value));
};

const setText = (fd: FormData, key: string, value: string | undefined): void => {
  if (value) fd.set(key, value);
};

@Injectable({ providedIn: 'root' })
export class ContractsService {
  private readonly remote = inject(RemoteService);

  list(query: ContractListQuery): Observable<GenericQueryResponse<Contract>> {
    return this.remote.get<GenericQueryResponse<Contract>>('/contracts', {
      page: query.page,
      limit: query.limit,
      search: query.search,
      customerId: query.customerId,
      serviceOrderId: query.serviceOrderId,
      type: query.type,
      validity: query.validity,
      equipmentId: query.equipmentId,
      tag: query.tag,
    });
  }

  get(id: string): Observable<Contract> {
    return this.remote.get<Contract>(`/contracts/${id}`);
  }

  /** The client's filed contracts — the customer-view card (13 §6). A dedicated
   *  unpaged read capped backend-side: a client with more contracts than the cap
   *  belongs on the filtered list page, not in a card. */
  listForCustomer(customerId: string): Observable<Contract[]> {
    return this.remote
      .get<ContractsResponse>(`/customers/${customerId}/contracts`)
      .pipe(map((res) => res.contracts));
  }

  /** The contracts one job generated (13 §2 — an order generates 0..n). */
  listForServiceOrder(serviceOrderId: string): Observable<Contract[]> {
    return this.remote
      .get<ContractsResponse>(`/service-orders/${serviceOrderId}/contracts`)
      .pipe(map((res) => res.contracts));
  }

  /** Create is **one multipart request**: metadata plus the document. There is
   *  no standalone upload endpoint — folding the file in is what keeps the
   *  write behind the contracts role gate and makes an orphaned object
   *  impossible (13 §5). */
  create(payload: CreateContractRequest, file: File): Observable<Contract> {
    const fd = new FormData();
    fd.set('file', file);
    fd.set('customerId', payload.customerId);
    fd.set('name', payload.name);
    fd.set('type', payload.type);
    fd.set('validFromDate', payload.validFromDate);
    setText(fd, 'serviceOrderId', payload.serviceOrderId);
    setText(fd, 'description', payload.description);
    setText(fd, 'expiryDate', payload.expiryDate);
    setJson(fd, 'tags', payload.tags);
    setJson(fd, 'visibleToRoles', payload.visibleToRoles);
    setJson(fd, 'equipmentIds', payload.equipmentIds);
    return this.remote.postForm<Contract>('/contracts', fd);
  }

  update(id: string, payload: UpdateContractRequest): Observable<Contract> {
    return this.remote.patch<Contract>(`/contracts/${id}`, payload);
  }

  /** Swap the stored document. The whole file unit moves at once and old
   *  versions are not kept (13 §1.2). */
  replaceFile(id: string, file: File): Observable<Contract> {
    const fd = new FormData();
    fd.set('file', file);
    return this.remote.postForm<Contract>(`/contracts/${id}/file`, fd);
  }

  /** The document itself, streamed from the private bucket. There is no URL to
   *  hold or share — access is re-checked on every request, so the bytes are
   *  fetched and handed straight to the browser (13 §1.2). */
  download(id: string): Observable<Blob> {
    return this.remote.getBlob(`/contracts/${id}/file`);
  }

  remove(id: string, body: DeleteContractRequest): Observable<void> {
    return this.remote.delete<void>(`/contracts/${id}`, body);
  }
}

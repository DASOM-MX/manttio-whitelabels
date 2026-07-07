import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type {
  CmsClient,
  CmsDocument,
  CmsHome,
  CmsSection,
  SaveCmsClientRequest,
} from '../../data/dtos/cms';

/** Editor-side CMS API (04 §2): GETs serve the draft; publish copies
 *  draft → published. The public site reads published-only elsewhere. */
@Injectable({ providedIn: 'root' })
export class CmsService {
  private readonly remote = inject(RemoteService);

  getHome(): Observable<CmsDocument<CmsHome>> {
    return this.remote.get<CmsDocument<CmsHome>>('/cms/home');
  }

  saveHome(body: CmsHome): Observable<CmsDocument<CmsHome>> {
    return this.remote.put<CmsDocument<CmsHome>>('/cms/home', body);
  }

  getClients(): Observable<CmsDocument<CmsClient[]>> {
    return this.remote.get<CmsDocument<CmsClient[]>>('/cms/clients');
  }

  createClient(body: SaveCmsClientRequest): Observable<CmsClient> {
    return this.remote.post<CmsClient>('/cms/clients', body);
  }

  updateClient(id: string, body: SaveCmsClientRequest): Observable<CmsClient> {
    return this.remote.patch<CmsClient>(`/cms/clients/${id}`, body);
  }

  deleteClient(id: string): Observable<void> {
    return this.remote.delete<void>(`/cms/clients/${id}`);
  }

  publish(section: CmsSection): Observable<void> {
    return this.remote.post<void>(`/cms/${section}/publish`, {});
  }
}

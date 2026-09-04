import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { runtimeConfig } from '../../config/runtime-config';
import { toParams } from '../../data/utils';
import type { Query } from '../../data/types/http/query.type';

@Injectable({ providedIn: 'root' })
export class RemoteService {
  private readonly http = inject(HttpClient);

  /** Read lazily rather than captured in a field: `loadRuntimeConfig()`
   *  resolves after the injector exists, and NGXS state construction pulls
   *  this service in during that window (25 CP-1). */
  private get base(): string {
    return (runtimeConfig.apiUrl ?? '').replace(/\/$/, '');
  }

  /** Absolute URL for an API path — public for the consumers that bypass
   *  HttpClient (the fetch-based SSE reader needs a full URL). */
  url(path: string): string {
    return `${this.base}${path.startsWith('/') ? path : `/${path}`}`;
  }

  get<T>(path: string, query?: Query): Observable<T> {
    return this.http.get<T>(this.url(path), { params: toParams(query) });
  }
  post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<T>(this.url(path), body);
  }
  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http.patch<T>(this.url(path), body);
  }
  put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<T>(this.url(path), body);
  }
  delete<T>(path: string, body?: unknown): Observable<T> {
    return this.http.request<T>('DELETE', this.url(path), { body });
  }
  postForm<T>(path: string, form: FormData): Observable<T> {
    return this.http.post<T>(this.url(path), form);
  }
  putForm<T>(path: string, form: FormData): Observable<T> {
    return this.http.put<T>(this.url(path), form);
  }
  getBlob(path: string): Observable<Blob> {
    return this.http.get(this.url(path), { responseType: 'blob' });
  }
}

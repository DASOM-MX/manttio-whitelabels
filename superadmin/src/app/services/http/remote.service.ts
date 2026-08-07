import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { toParams, type Query } from '../../data/utils';

@Injectable({ providedIn: 'root' })
export class RemoteService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl.replace(/\/$/, '');

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

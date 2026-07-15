import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type { UploadImageResponse } from '../../data/dtos/upload';

@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly remote = inject(RemoteService);

  uploadImage(file: File): Observable<UploadImageResponse> {
    const fd = new FormData();
    fd.set('file', file);
    return this.remote.postForm<UploadImageResponse>('/upload/image', fd);
  }

  /** Brand assets (logo / isologo / favicon) — the dedicated `manttio-logos`
   *  bucket; the returned key is what `PUT /brand` expects. */
  uploadLogo(file: File): Observable<UploadImageResponse> {
    const fd = new FormData();
    fd.set('file', file);
    return this.remote.postForm<UploadImageResponse>('/upload/logo', fd);
  }
}

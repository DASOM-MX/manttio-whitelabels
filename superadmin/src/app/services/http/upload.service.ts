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

  /** Equipment photos — the dedicated `manttio-equipment` bucket; the returned
   *  URL is committed into equipment.photos on save. */
  uploadEquipmentPhoto(file: File): Observable<UploadImageResponse> {
    const fd = new FormData();
    fd.set('file', file);
    return this.remote.postForm<UploadImageResponse>('/upload/equipment', fd);
  }

  /** Public marketing-site imagery (service catalog photos) — the dedicated
   *  `manttio-images` bucket. Commit the returned **key**, not the URL: the
   *  backend materializes URLs on read so a CDN move never rewrites rows. */
  uploadWebsiteImage(file: File): Observable<UploadImageResponse> {
    const fd = new FormData();
    fd.set('file', file);
    return this.remote.postForm<UploadImageResponse>('/upload/website-image', fd);
  }
}

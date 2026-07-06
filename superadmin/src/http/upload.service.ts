import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type { UploadImageResponse } from '../app/data/dtos/upload';

@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly remote = inject(RemoteService);

  uploadImage(file: File): Observable<UploadImageResponse> {
    const fd = new FormData();
    fd.set('file', file);
    return this.remote.postForm<UploadImageResponse>('/upload/image', fd);
  }
}

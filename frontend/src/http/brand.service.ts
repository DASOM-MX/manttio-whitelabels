import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type { Brand, FontCatalogEntry } from '../app/data/dtos/brand';

/** Public endpoints (no auth needed); the interceptor attaching a JWT is harmless. */
@Injectable({ providedIn: 'root' })
export class BrandService {
  private readonly remote = inject(RemoteService);

  get(): Observable<Brand> {
    return this.remote.get<Brand>('/brand');
  }
  fonts(): Observable<FontCatalogEntry[]> {
    return this.remote.get<FontCatalogEntry[]>('/fonts');
  }
}

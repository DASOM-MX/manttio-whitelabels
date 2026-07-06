import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type { Brand, FontCatalogEntry, SaveBrandRequest } from '../app/data/dtos/brand';

@Injectable({ providedIn: 'root' })
export class BrandService {
  private readonly remote = inject(RemoteService);

  /** Public read — pre-auth (login screen) and website both consume it;
   *  served backend-side from the per-tenant cache DO (03 §5.1). */
  getBrand(): Observable<Brand> {
    return this.remote.get<Brand>('/brand');
  }

  /** Owner-only, direct-apply (03 §8): goes live for website + both apps. */
  saveBrand(body: SaveBrandRequest): Observable<Brand> {
    return this.remote.put<Brand>('/brand', body);
  }

  /** Public curated font catalog (03 §2.1). */
  getFonts(): Observable<FontCatalogEntry[]> {
    return this.remote.get<FontCatalogEntry[]>('/fonts');
  }
}

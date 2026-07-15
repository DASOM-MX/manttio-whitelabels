import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { EMPTY, forkJoin, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { BrandService } from '../../http/brand.service';
import { LoadBrand } from './brand.actions';
import type { Brand, FontCatalogEntry } from '../../app/data/dtos/brand';

export interface BrandStateModel {
  /** Last fetched tenant brand; null until the first successful load. Persisted
   *  so the previous brand paints instantly on the next boot (and offline) —
   *  `LoadBrand` then refreshes it in the background. */
  brand: Brand | null;
  /** Font catalog (`GET /fonts`) — resolves `brand.font` codes to woff2 URLs. */
  fonts: FontCatalogEntry[];
  /** True once a live fetch has succeeded at least once on this device. */
  loaded: boolean;
}

@State<BrandStateModel>({
  name: 'brand',
  defaults: { brand: null, fonts: [], loaded: false },
})
@Injectable()
export class BrandState {
  private readonly api = inject(BrandService);

  @Selector() static brand(s: BrandStateModel): Brand | null {
    return s.brand;
  }
  @Selector() static fonts(s: BrandStateModel): FontCatalogEntry[] {
    return s.fonts;
  }
  @Selector() static loaded(s: BrandStateModel): boolean {
    return s.loaded;
  }

  @Action(LoadBrand)
  load(ctx: StateContext<BrandStateModel>) {
    return forkJoin({
      brand: this.api.get(),
      // A missing catalog only costs custom @font-face rules — never the brand.
      fonts: this.api.fonts().pipe(catchError(() => of([] as FontCatalogEntry[]))),
    }).pipe(
      tap(({ brand, fonts }) => ctx.patchState({ brand, fonts, loaded: true })),
      // Fail-soft (offline, backend without /brand yet): keep the persisted brand.
      catchError(() => EMPTY),
    );
  }
}

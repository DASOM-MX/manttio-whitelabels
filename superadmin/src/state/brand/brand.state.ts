import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { catchError, of, tap } from 'rxjs';
import { BrandService } from '../../http/brand.service';
import { applyBrandTheme } from '../../app/theme/apply-brand';
import { LoadBrand, LoadFonts, SaveBrand } from './brand.actions';
import type { Brand, FontCatalogEntry } from '../../app/data/dtos/brand';

export interface BrandStateModel {
  brand: Brand | null;
  /** `GET /brand` settled (with data or without) — the login screen renders
   *  its manttio fallback only once this is true, avoiding a brand flash. */
  loaded: boolean;
  saving: boolean;
  fonts: FontCatalogEntry[];
}

@State<BrandStateModel>({
  name: 'brand',
  defaults: { brand: null, loaded: false, saving: false, fonts: [] },
})
@Injectable()
export class BrandState {
  private readonly api = inject(BrandService);

  @Selector() static brand(s: BrandStateModel): Brand | null {
    return s.brand;
  }
  @Selector() static loaded(s: BrandStateModel): boolean {
    return s.loaded;
  }
  @Selector() static saving(s: BrandStateModel): boolean {
    return s.saving;
  }
  @Selector() static fonts(s: BrandStateModel): FontCatalogEntry[] {
    return s.fonts;
  }

  @Action(LoadBrand)
  loadBrand(ctx: StateContext<BrandStateModel>) {
    return this.api.getBrand().pipe(
      tap((brand) => {
        ctx.patchState({ brand, loaded: true });
        applyBrandTheme(brand);
      }),
      // Fail soft: no brand (404/network) → manttio fallbacks keep rendering.
      catchError(() => {
        ctx.patchState({ loaded: true });
        applyBrandTheme(null);
        return of(null);
      }),
    );
  }

  @Action(SaveBrand)
  saveBrand(ctx: StateContext<BrandStateModel>, { payload }: SaveBrand) {
    ctx.patchState({ saving: true });
    return this.api.saveBrand(payload).pipe(
      tap((brand) => {
        ctx.patchState({ brand, saving: false });
        applyBrandTheme(brand);
      }),
      catchError((err) => {
        ctx.patchState({ saving: false });
        throw err;
      }),
    );
  }

  @Action(LoadFonts)
  loadFonts(ctx: StateContext<BrandStateModel>) {
    if (ctx.getState().fonts.length) return undefined;
    return this.api.getFonts().pipe(
      tap((fonts) => ctx.patchState({ fonts })),
      catchError(() => of(null)),
    );
  }
}

import { Injectable } from '@angular/core';
import { Action, Selector, State, StateContext } from '@ngxs/store';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { LoadBrand } from './brand.actions';

export interface Brand {
  name: string;
  logo?: string;
  accent?: string;
  primary?: string;
}

export interface BrandStateModel {
  data: Brand | null;
  loaded: boolean;
}

@State<BrandStateModel>({
  name: 'brand',
  defaults: {
    data: null,
    loaded: false,
  },
})
@Injectable()
export class BrandState {
  constructor(private http: HttpClient) {}

  @Selector()
  static data(state: BrandStateModel): Brand | null {
    return state.data;
  }

  @Selector()
  static loaded(state: BrandStateModel): boolean {
    return state.loaded;
  }

  @Action(LoadBrand)
  loadBrand(ctx: StateContext<BrandStateModel>) {
    return this.http.get<Brand>('/brand').pipe(
      tap((brand) => {
        ctx.patchState({
          data: brand,
          loaded: true,
        });
        // Apply brand colors to CSS variables (plan 03 §3)
        if (brand.primary) {
          this.applyBrandColors(brand);
        }
      })
    );
  }

  private applyBrandColors(brand: Brand) {
    // Placeholder for brand color application
    // This will be expanded in CP-2 with full BrandThemeService
    if (typeof document !== 'undefined') {
      // Color application happens here via CSS variables
      // --brand-primary-*, --brand-accent-* etc.
    }
  }
}

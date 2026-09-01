import { Injectable, inject } from '@angular/core';
import { Action, Selector, State, StateContext } from '@ngxs/store';
import { catchError, of, tap } from 'rxjs';
import { LoadBrand } from './brand.actions';
import { RemoteService } from '../../app/services/http/remote.service';
import { BrandThemeService } from '../../app/services/theme/brand-theme.service';
import type { Brand } from '../../app/data/dtos/brand/brand';

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
  private readonly api = inject(RemoteService);
  private readonly theme = inject(BrandThemeService);

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
    return this.api.get<Brand>('/brand').pipe(
      tap((brand) => {
        ctx.patchState({
          data: brand,
          loaded: true,
        });
        this.theme.apply(brand);
      }),
      // Fail soft: no brand (404/network) → manttio fallbacks keep rendering.
      catchError(() => {
        ctx.patchState({ loaded: true });
        this.theme.apply(null);
        return of(null);
      }),
    );
  }
}

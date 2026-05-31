import { Injectable } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { SetOnline, SetDarkMode } from './app.actions';

export interface AppStateModel {
  /** Browser connectivity. Kept here (not in a service) so any component can read it
   *  via `select(AppState.isOnline)` without injecting the connectivity watcher. */
  online: boolean;
  /** User-chosen dark mode preference. Persisted via the storage plugin (`app` key);
   *  a side-effect in `app.ts` mirrors it onto `<html>.app-dark` so Tailwind's
   *  `dark:` variants and PrimeNG's `darkModeSelector` both light up together. */
  darkMode: boolean;
}

@State<AppStateModel>({
  name: 'app',
  defaults: { online: true, darkMode: false },
})
@Injectable()
export class AppState {
  @Selector() static isOnline(s: AppStateModel): boolean {
    return s.online;
  }
  @Selector() static darkMode(s: AppStateModel): boolean {
    return s.darkMode;
  }

  @Action(SetOnline)
  setOnline(ctx: StateContext<AppStateModel>, { online }: SetOnline) {
    ctx.patchState({ online });
  }

  @Action(SetDarkMode)
  setDarkMode(ctx: StateContext<AppStateModel>, { darkMode }: SetDarkMode) {
    ctx.patchState({ darkMode });
  }
}

import { Injectable } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { SetOnline, SetDarkMode, SetSidebarCollapsed } from './app.actions';

export interface AppStateModel {
  /** Browser connectivity. Kept here (not in a service) so any component can
   *  read it via `select(AppState.isOnline)`. */
  online: boolean;
  /** User-chosen dark mode preference. Persisted via the storage plugin
   *  (`app` key); a side-effect in `app.ts` mirrors it onto `<html>.app-dark`. */
  darkMode: boolean;
  /** Desktop sidebar collapsed to its icon rail. Persisted with the slice;
   *  the mobile drawer ignores it (always expanded). */
  sidebarCollapsed: boolean;
}

@State<AppStateModel>({
  name: 'app',
  defaults: { online: true, darkMode: false, sidebarCollapsed: false },
})
@Injectable()
export class AppState {
  @Selector() static isOnline(s: AppStateModel): boolean {
    return s.online;
  }
  @Selector() static darkMode(s: AppStateModel): boolean {
    return s.darkMode;
  }
  @Selector() static sidebarCollapsed(s: AppStateModel): boolean {
    return s.sidebarCollapsed;
  }

  @Action(SetOnline)
  setOnline(ctx: StateContext<AppStateModel>, { online }: SetOnline) {
    ctx.patchState({ online });
  }

  @Action(SetDarkMode)
  setDarkMode(ctx: StateContext<AppStateModel>, { darkMode }: SetDarkMode) {
    ctx.patchState({ darkMode });
  }

  @Action(SetSidebarCollapsed)
  setSidebarCollapsed(ctx: StateContext<AppStateModel>, { collapsed }: SetSidebarCollapsed) {
    ctx.patchState({ sidebarCollapsed: collapsed });
  }
}

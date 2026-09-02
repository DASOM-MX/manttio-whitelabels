import { Injectable } from '@angular/core';
import { Action, Selector, State, StateContext } from '@ngxs/store';
import { SetDarkMode, SetSidebarCollapsed } from './app.actions';

export interface AppStateModel {
  darkMode: boolean;
  /** Desktop sidebar collapsed to its icon rail; the mobile drawer ignores
   *  it (always expanded). Persisted with the slice. */
  sidebarCollapsed: boolean;
}

@State<AppStateModel>({
  name: 'app',
  defaults: {
    darkMode: false,
    sidebarCollapsed: false,
  },
})
@Injectable()
export class AppState {
  @Selector()
  static darkMode(state: AppStateModel): boolean {
    return state.darkMode;
  }

  @Selector()
  static sidebarCollapsed(state: AppStateModel): boolean {
    return state.sidebarCollapsed;
  }

  @Action(SetDarkMode)
  setDarkMode(ctx: StateContext<AppStateModel>, action: SetDarkMode) {
    ctx.patchState({ darkMode: action.payload });
  }

  @Action(SetSidebarCollapsed)
  setSidebarCollapsed(ctx: StateContext<AppStateModel>, action: SetSidebarCollapsed) {
    ctx.patchState({ sidebarCollapsed: action.payload });
  }
}

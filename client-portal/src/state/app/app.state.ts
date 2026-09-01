import { Injectable } from '@angular/core';
import { Action, Selector, State, StateContext } from '@ngxs/store';

export class SetDarkMode {
  static readonly type = '[App] Set Dark Mode';
  constructor(public payload: boolean) {}
}

export interface AppStateModel {
  darkMode: boolean;
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
}

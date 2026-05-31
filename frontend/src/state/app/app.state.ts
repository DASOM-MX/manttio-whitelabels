import { Injectable } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { SetOnline } from './app.actions';

export interface AppStateModel {
  /** Browser connectivity. Kept here (not in a service) so any component can read it
   *  via `select(AppState.isOnline)` without injecting the connectivity watcher. */
  online: boolean;
}

@State<AppStateModel>({
  name: 'app',
  defaults: { online: true },
})
@Injectable()
export class AppState {
  @Selector() static isOnline(s: AppStateModel): boolean {
    return s.online;
  }

  @Action(SetOnline)
  setOnline(ctx: StateContext<AppStateModel>, { online }: SetOnline) {
    ctx.patchState({ online });
  }
}

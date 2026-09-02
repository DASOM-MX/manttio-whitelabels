import { Component, effect, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { select } from '@ngxs/store';
import { AppState } from '../state/app/app.state';
import { ForcePasswordDialogComponent } from './shared/components/force-password-dialog/force-password-dialog';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ForcePasswordDialogComponent],
  template: `
    <router-outlet />
    <app-force-password-dialog />
  `,
})
export class App {
  private readonly document = inject(DOCUMENT);
  /** Reflect the persisted dark-mode preference onto `<html>` as the
   *  `.app-dark` class — both Tailwind (`darkMode: ['class', '.app-dark']`)
   *  and PrimeNG (`darkModeSelector: '.app-dark'`) follow this single
   *  source of truth. */
  private readonly darkMode = select(AppState.darkMode);

  /** Browser chrome color per mode: matches the page background. */
  private static readonly THEME_COLOR = { light: '#F6F7F7', dark: '#131717' };

  constructor() {
    effect(() => {
      const dark = this.darkMode();
      this.document.documentElement.classList.toggle('app-dark', dark);
      this.document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', dark ? App.THEME_COLOR.dark : App.THEME_COLOR.light);
    });
  }
}

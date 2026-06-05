import { Component, effect, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { select } from '@ngxs/store';
import { AppState } from '../state/app/app.state';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastModule, ConfirmDialogModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private document = inject(DOCUMENT);
  /** Reflect the persisted dark-mode preference onto `<html>` as the `.app-dark`
   *  class — both Tailwind (`darkMode: ['class', '.app-dark']`) and PrimeNG
   *  (`darkModeSelector: '.app-dark'`) follow this single source of truth. */
  private darkMode = select(AppState.darkMode);

  protected title = 'manttio';

  /** Browser chrome (Chrome/Firefox address bar, PWA status bar) color per mode.
   *  Light = navy frame matching the bottom nav; dark = granite-950 page bg so
   *  the toolbar blends into the dark app. */
  private static readonly THEME_COLOR = { light: '#243345', dark: '#131717' };

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

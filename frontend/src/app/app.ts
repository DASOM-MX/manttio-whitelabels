import { Component, effect, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { select } from '@ngxs/store';
import { AppState } from '../state/app/app.state';
import { BrandState } from '../state/brand/brand.state';
import { buildBrandCss } from './theme/brand-css';
import { SyncPendingReportsDialog } from './shared/components/sync-pending-reports-dialog/sync-pending-reports-dialog';
import type { Brand, FontCatalogEntry } from './data/dtos/brand';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastModule, ConfirmDialogModule, SyncPendingReportsDialog],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private document = inject(DOCUMENT);
  /** Reflect the persisted dark-mode preference onto `<html>` as the `.app-dark`
   *  class — both Tailwind (`darkMode: ['class', '.app-dark']`) and PrimeNG
   *  (`darkModeSelector: '.app-dark'`) follow this single source of truth. */
  private darkMode = select(AppState.darkMode);
  private brand = select(BrandState.brand);
  private fonts = select(BrandState.fonts);

  protected title = 'manttio';

  /** Browser chrome (Chrome/Firefox address bar, PWA status bar) HSL components
   *  per mode when no brand is loaded yet (rule 3 — neutral pre-fetch instant).
   *  Light = a primary-800 frame matching the bottom nav; dark = zinc-950
   *  page bg so the toolbar blends into the dark app. */
  // `light` is the pre-brand neutral standing in for the tenant's primary-800.
  // `dark` is not a fallback but the value: it must match the dark page ground,
  // `bg-zinc-950` (#09090B), or the browser chrome banks against the page.
  private static readonly THEME_COLOR_FALLBACK = { light: '220 10% 28%', dark: '240 10% 3.9%' };

  constructor() {
    effect(() => {
      const dark = this.darkMode();
      this.document.documentElement.classList.toggle('app-dark', dark);
      this.applyThemeColor(dark, this.brand());
    });
    // Apply the tenant brand (plan 02 §1.2): CSS vars + @font-face, favicon /
    // apple-touch-icon, document + home-screen titles. Absent fields keep the
    // neutral bundled defaults (rule 5 — hide, never fake).
    effect(() => this.applyBrand(this.brand(), this.fonts()));
  }

  private applyThemeColor(dark: boolean, brand: Brand | null): void {
    const components = dark
      ? App.THEME_COLOR_FALLBACK.dark
      : (brand?.colors.primary?.['800'] ?? App.THEME_COLOR_FALLBACK.light);
    this.document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', `hsl(${components})`);
  }

  private applyBrand(brand: Brand | null, fonts: FontCatalogEntry[]): void {
    if (!brand) return;

    const css = buildBrandCss(brand, fonts);
    let style = this.document.getElementById('brand-vars');
    if (css) {
      if (!style) {
        style = this.document.createElement('style');
        style.id = 'brand-vars';
        this.document.head.appendChild(style);
      }
      style.textContent = css;
    } else {
      style?.remove();
    }

    const icon = brand.faviconUrl ?? brand.isologoUrl;
    if (icon) {
      const favicon = this.document.querySelector('link[rel="icon"]');
      favicon?.setAttribute('href', icon);
      favicon?.removeAttribute('type'); // let the browser sniff the CDN asset
      this.document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute('href', icon);
    }

    const name = brand.name.trim();
    if (name) {
      this.document.title = name;
      this.document
        .querySelector('meta[name="apple-mobile-web-app-title"]')
        ?.setAttribute('content', name);
    }
  }
}

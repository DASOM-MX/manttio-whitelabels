import {
  ApplicationConfig,
  inject,
  isDevMode,
  PLATFORM_ID,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { providePrimeNG } from 'primeng/config';
import { ConfirmationService, MessageService } from 'primeng/api';
import { provideStore, Store } from '@ngxs/store';
import { withNgxsStoragePlugin } from '@ngxs/storage-plugin';
import { withNgxsReduxDevtoolsPlugin } from '@ngxs/devtools-plugin';
import { withNgxsLoggerPlugin } from '@ngxs/logger-plugin';
import { ManttioPreset } from './theme/manttio-preset';
import { routes } from './app.routes';
import { loadRuntimeConfig } from './config/runtime-config';
import { AppState } from '../state/app/app.state';
import { BrandState } from '../state/brand/brand.state';
import { LoadBrand } from '../state/brand/brand.actions';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(),
    provideRouter(routes),
    providePrimeNG({
      ripple: false,
      theme: {
        preset: ManttioPreset,
        options: {
          // `<html>.app-dark` is the single dark-mode source of truth —
          // Tailwind's `darkMode` selector and PrimeNG both read it.
          darkModeSelector: '.app-dark',
          // PrimeNG injects CSS into a layer; Tailwind's preflight must
          // come first so it doesn't wipe Aura component borders.
          cssLayer: { name: 'primeng', order: 'tailwind-base, primeng' },
        },
      },
    }),
    ConfirmationService,
    MessageService,
    provideStore(
      [AppState, BrandState],
      // Persist app state (dark mode, sidebar) to storage
      withNgxsStoragePlugin({ keys: ['app'] }),
      withNgxsReduxDevtoolsPlugin({ disabled: !isDevMode() }),
      withNgxsLoggerPlugin({ disabled: !isDevMode() }),
    ),
    // Runtime config resolves first, before any other boot-time fetches (25 §3).
    // The folded initializer ensures config is available before LoadBrand needs it.
    provideAppInitializer(async () => {
      const platformId = inject(PLATFORM_ID);
      const store = inject(Store);
      // Skipped outside the browser. Every route is `RenderMode.Client`, so
      // this never runs for a real request — but the build boots the app under
      // Node to extract the route tree (25 §5.2).
      if (!isPlatformBrowser(platformId)) return;
      await loadRuntimeConfig();
      // Fetch the tenant brand: colors, logo, name, fonts. This runs before
      // any route renders.
      store.dispatch(new LoadBrand());
    }),
    provideClientHydration(withEventReplay()),
  ],
};

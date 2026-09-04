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
import { provideHttpClient, withInterceptors } from '@angular/common/http';
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
import { AuthState } from '../state/auth/auth.state';
import { AuthLoadMe } from '../state/auth/auth.actions';
import { BrandState } from '../state/brand/brand.state';
import { ReportsState } from '../state/reports/reports.state';
import { ContractsState } from '../state/contracts/contracts.state';
import { QuotationsState } from '../state/quotations/quotations.state';
import { ServiceOrdersState } from '../state/service-orders/service-orders.state';
import { EquipmentState } from '../state/equipment/equipment.state';
import { HomeState } from '../state/home/home.state';
import { LoadBrand } from '../state/brand/brand.actions';
import { portalTokenInterceptor } from './services/http/portal-token.interceptor';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(withInterceptors([portalTokenInterceptor])),
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
      [
        AppState,
        AuthState,
        BrandState,
        ReportsState,
        ContractsState,
        QuotationsState,
        ServiceOrdersState,
        EquipmentState,
        HomeState,
      ],
      // Persist app state (dark mode, sidebar) and the whole auth slice, so a
      // returning session paints the nav immediately; `AuthLoadMe` below
      // refreshes it against the backend on every boot.
      withNgxsStoragePlugin({ keys: ['app', 'auth'] }),
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
      // Boot-time fetch, fire-and-forget: public `GET /brand` for pre-auth
      // theming (login screen shows tenant logo + colors, 03 §4).
      store.dispatch(new LoadBrand());
      // A persisted token means a returning session — the authenticated
      // layout splashes on `meStatus` until this resolves (03 §2).
      if (store.selectSnapshot(AuthState.token)) store.dispatch(new AuthLoadMe());
    }),
    provideClientHydration(withEventReplay()),
  ],
};

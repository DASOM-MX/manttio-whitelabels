import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
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
import { authInterceptor } from './interceptors/auth.interceptor';
import { AppState } from '../state/app/app.state';
import { AuthState } from '../state/auth/auth.state';
import { LoadMe } from '../state/auth/auth.actions';
import { BrandState } from '../state/brand/brand.state';
import { NotificationsState } from '../state/notifications/notifications.state';
import { LoadBrand } from '../state/brand/brand.actions';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideRouter(routes),
    providePrimeNG({
      ripple: false,
      theme: {
        preset: ManttioPreset,
        options: {
          // `<html>.app-dark` is the single dark-mode source of truth —
          // Tailwind's `darkMode` selector and PrimeNG both read it.
          darkModeSelector: '.app-dark',
          // Put Aura into a named CSS layer so the surviving unlayered
          // sheets in `src/theme/*.scss` win over Aura's runtime-injected
          // CSS without `!important`. The `order` string here is the
          // AUTHORITATIVE layer order: PrimeNG injects it as the first
          // <style> in <head> — before styles.css loads — so it, not the
          // `@layer` statement in styles.scss, fixes layer precedence.
          // `tailwind-base` (preflight) must come first or its
          // `border-width: 0` reset beats every Aura component border.
          cssLayer: { name: 'primeng', order: 'tailwind-base, primeng' },
        },
      },
    }),
    ConfirmationService,
    MessageService,
    provideStore(
      // NotificationsState is root-registered (not route-lazy): the bell lives
      // in the shell topbar, so its feed exists on every page.
      [AppState, AuthState, BrandState, NotificationsState],
      // Only the token persists — `me` (role) is refetched on
      // every boot so gated UI never renders from stale data (14 §3).
      withNgxsStoragePlugin({ keys: ['auth.token', 'app'] }),
      withNgxsReduxDevtoolsPlugin({ disabled: !isDevMode() }),
      withNgxsLoggerPlugin({ disabled: !isDevMode() }),
    ),
    // Boot-time fetches, fire-and-forget: public `GET /brand` always (pre-auth
    // theming — login screen shows tenant logo + colors, 03 §4); `/auth/me`
    // when a session token exists (02 §3 — the layout splashes until it lands).
    provideAppInitializer(() => {
      const store = inject(Store);
      store.dispatch(new LoadBrand());
      if (store.selectSnapshot(AuthState.token)) store.dispatch(new LoadMe());
    }),
  ],
};

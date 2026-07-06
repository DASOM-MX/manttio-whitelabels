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
          // Put Aura into a named CSS layer so our unlayered per-component
          // override sheets in `src/theme/*.scss` win over Aura's runtime-
          // injected CSS without `!important`.
          cssLayer: { name: 'primeng', order: 'primeng' },
        },
      },
    }),
    ConfirmationService,
    MessageService,
    provideStore(
      [AppState, AuthState],
      // Only the token persists — `me` (role + tenantConfig) is refetched on
      // every boot so gated UI never renders from stale data (14 §3).
      withNgxsStoragePlugin({ keys: ['auth.token', 'app'] }),
      withNgxsReduxDevtoolsPlugin({ disabled: !isDevMode() }),
      withNgxsLoggerPlugin({ disabled: !isDevMode() }),
    ),
    // Boot-time `/auth/me` when a session token exists (02 §3). Fire-and-forget:
    // the layout splashes on `meStatus` until it resolves.
    provideAppInitializer(() => {
      const store = inject(Store);
      if (store.selectSnapshot(AuthState.token)) store.dispatch(new LoadMe());
    }),
  ],
};

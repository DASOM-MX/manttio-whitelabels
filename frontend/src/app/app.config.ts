import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
  provideAppInitializer,
  inject,
  isDevMode,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ManttioPreset } from './theme/manttio-preset';
import { provideStore, Store } from '@ngxs/store';
import { withNgxsStoragePlugin } from '@ngxs/storage-plugin';
import { withNgxsReduxDevtoolsPlugin } from '@ngxs/devtools-plugin';
import { withNgxsLoggerPlugin } from '@ngxs/logger-plugin';
import { routes } from './app.routes';
import { authInterceptor } from './interceptors/auth.interceptor';
import { AppState } from '../state/app/app.state';
import { AuthState } from '../state/auth/auth.state';
import { BrandState } from '../state/brand/brand.state';
import { LoadBrand } from '../state/brand/brand.actions';
import { UsersState } from '../state/users/users.state';
import { CustomersState } from '../state/customers/customers.state';
import { ReportsState } from '../state/reports/reports.state';
import { ReportDraftState } from '../state/report-draft/report-draft.state';
import { OfflineReportsState } from '../state/offline-reports/offline-reports.state';
import { LoadPendingReports } from '../state/offline-reports/offline-reports.actions';
import { VisitsState } from '../state/visits/visits.state';
import { PendingVisitActionsState } from '../state/pending-visit-actions/pending-visit-actions.state';
import { LoadPendingVisitActions } from '../state/pending-visit-actions/pending-visit-actions.actions';
import { OfflineSyncService } from '../offline/offline-sync.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideRouter(routes),
    provideAnimationsAsync(),
    providePrimeNG({
      ripple: false,
      theme: {
        preset: ManttioPreset,
        options: {
          // Disable Aura's automatic dark-mode (the app has no `dark:` variants;
          // following OS preference produced a dark table on a light page).
          // The selector class is intentionally one we never apply.
          darkModeSelector: '.app-dark',
          // Put Aura into a named CSS layer so our unlayered per-component
          // override sheets in `src/theme/*.scss` win over Aura's runtime-
          // injected CSS. Without this, Aura's <style> tags are appended
          // after the SCSS bundle and beat the overrides on identical
          // specificity (last-write wins). With cssLayer set, any unlayered
          // rule outranks the entire `primeng` layer.
          cssLayer: { name: 'primeng', order: 'primeng' },
        },
      },
    }),
    ConfirmationService,
    MessageService,
    provideStore(
      [AppState, AuthState, BrandState, UsersState, CustomersState, ReportsState, ReportDraftState, OfflineReportsState, VisitsState, PendingVisitActionsState],
      // `brand` is persisted so the last-known tenant brand paints instantly on
      // the next boot; LoadBrand refreshes it in the background (plan 02 §1.1).
      withNgxsStoragePlugin({ keys: ['auth', 'reportDraft', 'app', 'brand'] }),
      withNgxsReduxDevtoolsPlugin({ disabled: !isDevMode() }),
      withNgxsLoggerPlugin({ disabled: !isDevMode() }),
    ),
    // Hydrate the offline queue from IndexedDB on boot (fire-and-forget; never blocks bootstrap)
    // and eagerly start the connectivity watcher so its online/offline listeners are bound.
    // LoadBrand refreshes the (already persisted) tenant brand in the background.
    provideAppInitializer(() => {
      const store = inject(Store);
      store.dispatch(new LoadPendingReports());
      store.dispatch(new LoadPendingVisitActions());
      store.dispatch(new LoadBrand());
      inject(OfflineSyncService);
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};

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
import { provideStore, Store } from '@ngxs/store';
import { withNgxsStoragePlugin } from '@ngxs/storage-plugin';
import { withNgxsReduxDevtoolsPlugin } from '@ngxs/devtools-plugin';
import { withNgxsLoggerPlugin } from '@ngxs/logger-plugin';
import { routes } from './app.routes';
import { authInterceptor } from './interceptors/auth.interceptor';
import { AppState } from '../state/app/app.state';
import { AuthState } from '../state/auth/auth.state';
import { UsersState } from '../state/users/users.state';
import { CustomersState } from '../state/customers/customers.state';
import { ReportsState } from '../state/reports/reports.state';
import { ReportDraftState } from '../state/report-draft/report-draft.state';
import { OfflineReportsState } from '../state/offline-reports/offline-reports.state';
import { LoadPendingReports } from '../state/offline-reports/offline-reports.actions';
import { OfflineSyncService } from '../offline/offline-sync.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideRouter(routes),
    provideAnimationsAsync(),
    providePrimeNG({ ripple: false, theme: 'none' }),
    ConfirmationService,
    MessageService,
    provideStore(
      [AppState, AuthState, UsersState, CustomersState, ReportsState, ReportDraftState, OfflineReportsState],
      withNgxsStoragePlugin({ keys: ['auth', 'reportDraft'] }),
      withNgxsReduxDevtoolsPlugin({ disabled: !isDevMode() }),
      withNgxsLoggerPlugin({ disabled: !isDevMode() }),
    ),
    // Hydrate the offline queue from IndexedDB on boot (fire-and-forget; never blocks bootstrap)
    // and eagerly start the connectivity watcher so its online/offline listeners are bound.
    provideAppInitializer(() => {
      inject(Store).dispatch(new LoadPendingReports());
      inject(OfflineSyncService);
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};

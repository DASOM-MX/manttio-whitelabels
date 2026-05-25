import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
  isDevMode,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import { ConfirmationService, MessageService } from 'primeng/api';
import { provideStore } from '@ngxs/store';
import { withNgxsStoragePlugin } from '@ngxs/storage-plugin';
import { withNgxsReduxDevtoolsPlugin } from '@ngxs/devtools-plugin';
import { withNgxsLoggerPlugin } from '@ngxs/logger-plugin';
import { routes } from './app.routes';
import { authInterceptor } from './interceptors/auth.interceptor';
import { AuthState } from '../state/auth/auth.state';
import { UsersState } from '../state/users/users.state';
import { CustomersState } from '../state/customers/customers.state';
import { ReportsState } from '../state/reports/reports.state';
import { ReportDraftState } from '../state/report-draft/report-draft.state';

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
      [AuthState, UsersState, CustomersState, ReportsState, ReportDraftState],
      withNgxsStoragePlugin({ keys: ['auth', 'reportDraft'] }),
      withNgxsReduxDevtoolsPlugin({ disabled: !isDevMode() }),
      withNgxsLoggerPlugin({ disabled: !isDevMode() }),
    ),
  ],
};

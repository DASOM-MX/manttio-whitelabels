import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpClientModule } from '@angular/common/http';
import { importProvidersFrom } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import { provideStore } from '@ngxs/store';
import { withNgxsStoragePlugin } from '@ngxs/storage-plugin';
import { routes } from './app.routes';
import { AuthState } from './store/auth/auth';
import { ReportsState } from './store/reports/reports';
import { CustomersState } from './store/customers/customers';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(),
    provideRouter(routes),
    provideAnimationsAsync(),
    providePrimeNG({ ripple: false, theme: 'none' }),
    provideStore(
      [AuthState, ReportsState, CustomersState],
      withNgxsStoragePlugin({ keys: ['auth', 'reports', 'customers'] }),
    ),
    importProvidersFrom(HttpClientModule),
  ],
};

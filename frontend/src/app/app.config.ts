import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpClientModule } from '@angular/common/http';
import { importProvidersFrom } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(),
    provideRouter(routes),
    provideAnimationsAsync(),
    // Unstyled mode — components ship without theme CSS. Visuals are driven
    // by the per-component stylesheets in src/theme/* (imported from
    // src/styles.scss) which target PrimeNG's class hooks via @apply on our
    // Tailwind design tokens.
    providePrimeNG({ ripple: false, theme: 'none' }),
    importProvidersFrom(HttpClientModule),
  ],
};

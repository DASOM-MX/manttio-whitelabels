import { defineConfig, devices } from '@playwright/test';

/**
 * Superadmin E2E (Playwright).
 *
 * The suite drives the real Angular app served on :4200 but stubs the backend
 * per-test with `page.route`, and seeds auth straight into storage — so it needs
 * neither a live API nor a seeded database (see `e2e/support/superadmin.ts`).
 * Locally it reuses an already-running `ng serve`; in CI it boots its own.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm start',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});

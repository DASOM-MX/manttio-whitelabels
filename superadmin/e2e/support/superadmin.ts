import type { Page } from '@playwright/test';
import type { MeResponse } from '../../src/app/data/dtos/auth';
import type { Customer, SaveCustomerRequest } from '../../src/app/data/dtos/customer';

/**
 * The NGXS storage plugin (app.config `keys: ['auth.token', 'app']`) persists
 * `auth.token` as a plain JSON string under that exact localStorage key.
 * Seeding it lets the auth + access guards pass without driving the login UI.
 */
const AUTH_STORAGE_KEY = 'auth.token';
const AUTH_TOKEN = 'e2e-superadmin-token';

export const ADMIN_ME: MeResponse = {
  user: { id: 'u-e2e', name: 'E2E Admin', email: 'admin@e2e.test' },
  role: 'admin',
  mustChangePassword: false,
};

/**
 * Seed the session and stub the two boot fetches the shell makes (`GET /auth/me`,
 * `GET /brand`), so the authenticated layout renders deterministically with no
 * backend. Call once per test before navigating.
 */
export async function signIn(page: Page, me: MeResponse = ADMIN_ME): Promise<void> {
  await page.addInitScript(
    ([key, token]) => window.localStorage.setItem(key, JSON.stringify(token)),
    [AUTH_STORAGE_KEY, AUTH_TOKEN] as const,
  );

  await page.route(/\/auth\/me(\?.*)?$/, (route) => route.fulfill({ json: me }));
  await page.route(/\/brand(\?.*)?$/, (route) => route.fulfill({ json: { name: 'E2E Brand' } }));
}

export interface CustomersApiMock {
  /** Body of the most recent `POST /customers`, or null if none yet. */
  lastCreate(): SaveCustomerRequest | null;
  /** Every customer the stubbed backend has "persisted" this test. */
  created(): Customer[];
}

/**
 * Stub the `/customers` collection endpoints. `GET` returns whatever has been
 * created so far; `POST` records the payload and echoes back a materialized row
 * in today's `{ customer }` wrapper (the service adapter unwraps it). Returns a
 * handle for asserting on what the form actually sent.
 */
export async function mockCustomersApi(page: Page): Promise<CustomersApiMock> {
  const store: Customer[] = [];
  let lastCreateBody: SaveCustomerRequest | null = null;

  await page.route(/\/customers(\?.*)?$/, async (route) => {
    const request = route.request();

    if (request.method() === 'POST') {
      lastCreateBody = request.postDataJSON() as SaveCustomerRequest;
      const now = new Date().toISOString();
      const customer = {
        id: `c-${store.length + 1}`,
        createdAt: now,
        updatedAt: now,
        ...lastCreateBody,
        tags: lastCreateBody.tags ?? [],
        contacts: lastCreateBody.contacts ?? [],
      } as Customer;
      store.push(customer);
      await route.fulfill({ status: 201, json: { customer } });
      return;
    }

    await route.fulfill({
      json: { items: store, total: store.length, page: 1, limit: store.length },
    });
  });

  return {
    lastCreate: () => lastCreateBody,
    created: () => store,
  };
}

/**
 * Open a PrimeNG `p-select` (identified by its `inputId`) and pick an option by
 * its visible label. The overlay renders its options to `document.body`.
 */
export async function selectOption(page: Page, inputId: string, label: string): Promise<void> {
  await page.locator(`p-select:has(#${inputId})`).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

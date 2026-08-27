import type { Page } from '@playwright/test';
import type { MeResponse } from '../../src/app/data/dtos/auth';
import type { Customer, SaveCustomerRequest } from '../../src/app/data/dtos/customer';
import type { Notification } from '../../src/app/data/dtos/notification';
import type { SaveServiceRequest, Service } from '../../src/app/data/dtos/service';

/**
 * The NGXS storage plugin (app.config `keys: ['auth.token', 'app']`) persists
 * `auth.token` as a plain JSON string under that exact localStorage key.
 * Seeding it lets the auth + access guards pass without driving the login UI.
 */
const AUTH_STORAGE_KEY = 'auth.token';
const AUTH_TOKEN = 'e2e-superadmin-token';

/** The dev API origin every superadmin HTTP call goes to
 *  (`environment.development.ts`). Route patterns anchor on it deliberately: a
 *  bare `/customers` regex also matches the SPA's own document navigation, and
 *  fulfilling a page navigation with JSON white-screens the test. */
export const API_ORIGIN = 'http://127.0.0.1:8788';

/**
 * Catch-all for the API host: answer anything a test did not stub with an empty
 * envelope. Without it, a page that fetches more than the spec cares about
 * (any real shell page does) reaches a dev backend on :8788, which answers the
 * fake e2e token with a genuine 401 — and the interceptor logs the session out
 * from under the assertions. That failure only reproduces when a backend
 * happens to be running, which is the worst kind of red.
 *
 * Register it FIRST — before `signIn` and before any per-test stub. Later
 * routes win in Playwright, so everything specific keeps precedence over this.
 */
export async function stubIdleApi(page: Page): Promise<void> {
  await page.route(`${API_ORIGIN}/**`, (route) =>
    route.fulfill({ json: { items: [], total: 0, page: 1, limit: 10 } }),
  );
}

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

  // The shell's notification bell fires on every authenticated page. Stub
  // quiet defaults here, or a live dev backend answers the fake token with a
  // real 401 and the interceptor logs the whole test out mid-run. Specs that
  // assert on notifications register mockNotificationsApi afterwards — later
  // routes win, so these defaults never shadow it.
  await page.route(/\/notifications\/stream$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'event: unread-count\ndata: 0\n\n',
    }),
  );
  await page.route(/\/notifications(\?.*)?$/, (route) =>
    route.fulfill({ json: { items: [], total: 0, unreadCount: 0, page: 1, limit: 25 } }),
  );
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

export interface ServicesApiMock {
  /** Body of the most recent `POST /services`, or null if none yet. */
  lastCreate(): SaveServiceRequest | null;
  /** Services created via POST this test — seed rows excluded. */
  created(): Service[];
}

/**
 * Stub the `/services` catalog surface, seeded with the rows a test starts
 * from. `GET` (list and single) serves the store; `POST` records the payload
 * and echoes a materialized DTO (money numbers come back as the fixed-2
 * strings the API answers with). The timeline answers empty — a spec that
 * asserts on the trail registers its own route afterwards; later routes win.
 *
 * Document requests fall through: `/services` and `/services/:id` are also
 * SPA URLs on :4200, and fulfilling a page navigation with JSON white-screens
 * the test.
 */
export async function mockServicesApi(page: Page, seed: Service[] = []): Promise<ServicesApiMock> {
  const store: Service[] = [...seed];
  let lastCreateBody: SaveServiceRequest | null = null;

  await page.route(/\/services\/[^/?]+\/timeline$/, (route) => route.fulfill({ json: [] }));

  await page.route(/\/services\/[^/?]+$/, async (route) => {
    const request = route.request();
    if (request.resourceType() === 'document' || request.method() !== 'GET') {
      await route.fallback();
      return;
    }
    const id = new URL(request.url()).pathname.split('/').pop();
    const found = store.find((s) => s.id === id);
    if (!found) {
      await route.fulfill({ status: 404, json: { error: 'not_found' } });
      return;
    }
    await route.fulfill({ json: found });
  });

  await page.route(/\/services(\?.*)?$/, async (route) => {
    const request = route.request();
    if (request.resourceType() === 'document') {
      await route.fallback();
      return;
    }

    if (request.method() === 'POST') {
      lastCreateBody = request.postDataJSON() as SaveServiceRequest;
      const now = new Date().toISOString();
      const service: Service = {
        id: `svc-created-${store.length + 1}`,
        name: lastCreateBody.name,
        price: lastCreateBody.price.toFixed(2),
        cost: lastCreateBody.cost == null ? undefined : lastCreateBody.cost.toFixed(2),
        uom: lastCreateBody.uom,
        description: lastCreateBody.description || undefined,
        websiteDescription: lastCreateBody.websiteDescription || undefined,
        websiteImageKey: lastCreateBody.websiteImageKey || undefined,
        internalServiceCode: lastCreateBody.internalServiceCode || undefined,
        taxRate: lastCreateBody.taxRate,
        isReportSource: lastCreateBody.isReportSource,
        isListableInWebsite: lastCreateBody.isListableInWebsite,
        isPriceVisibleInWebsite: lastCreateBody.isPriceVisibleInWebsite,
        createdAt: now,
        updatedAt: now,
      };
      store.push(service);
      await route.fulfill({ status: 201, json: service });
      return;
    }

    // The catalog browse is paged since 21 CP-5, so the stub answers the
    // envelope — and honours `page`/`limit`/`q` rather than replaying the whole
    // store, or a paging spec would pass against a stub that always serves
    // page 1. That is the exact shape of the bug plan 21 was opened for.
    const url = new URL(request.url());
    const pageNum = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
    const limit = Math.max(1, Number(url.searchParams.get('limit') ?? '10') || 10);
    const term = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    const matched = term
      ? store.filter((s) =>
          [s.name, s.description, s.internalServiceCode].some((field) =>
            (field ?? '').toLowerCase().includes(term),
          ),
        )
      : store;
    const start = (pageNum - 1) * limit;
    await route.fulfill({
      json: {
        items: matched.slice(start, start + limit),
        total: matched.length,
        page: pageNum,
        limit,
      },
    });
  });

  return {
    lastCreate: () => lastCreateBody,
    created: () => store.slice(seed.length),
  };
}

export interface NotificationsApiMock {
  /** Ids the client has POSTed to `/:id/read`, in order. */
  markedRead(): string[];
  /** How many times `read-all` was called. */
  readAllCalls(): number;
}

/**
 * Stateful stub of the `/notifications` surface. `GET` serves the store;
 * the FIRST `/stream` response scripts a `text/event-stream` body that pushes
 * one extra notification (the live-delivery path) — later reconnects (the
 * state's repeat/retry loop re-syncs via the one-shot GET) only re-send the
 * current count. Mark-read endpoints mutate the store so re-syncs agree with
 * what the client believes.
 */
export async function mockNotificationsApi(page: Page): Promise<NotificationsApiMock> {
  const now = new Date().toISOString();
  const seeded: Notification = {
    id: 'n-1',
    type: 'announcement',
    title: 'Aviso del propietario',
    body: 'Revisa el nuevo procedimiento de reabastecimiento.',
    data: { link: '/customers/c-1' },
    status: 'unread',
    readAt: null,
    createdAt: now,
  };
  const pushed: Notification = {
    id: 'n-2',
    type: 'client_registered_from_website',
    title: 'Cliente nuevo desde el sitio web',
    body: 'Acme SA llegó por el formulario de contacto.',
    data: { customerId: 'c-2' },
    status: 'unread',
    readAt: null,
    createdAt: now,
  };
  const store: Notification[] = [seeded];
  const marked: string[] = [];
  let readAll = 0;
  let streamServed = false;
  const unreadCount = () => store.filter((n) => n.status === 'unread').length;

  await page.route(/\/notifications\/stream$/, async (route) => {
    let body = `event: unread-count\ndata: ${unreadCount()}\n\n`;
    if (!streamServed) {
      streamServed = true;
      store.unshift(pushed);
      body += `event: notification\ndata: ${JSON.stringify(pushed)}\n\n`;
      body += `event: unread-count\ndata: ${unreadCount()}\n\n`;
    }
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body });
  });

  await page.route(/\/notifications\/read-all$/, async (route) => {
    readAll += 1;
    let updated = 0;
    const readAt = new Date().toISOString();
    for (const n of store) {
      if (n.status === 'unread') {
        n.status = 'read';
        n.readAt = readAt;
        updated += 1;
      }
    }
    await route.fulfill({ json: { updated } });
  });

  await page.route(/\/notifications\/[^/?]+\/read$/, async (route) => {
    const id = /\/notifications\/([^/]+)\/read$/.exec(route.request().url())?.[1] ?? '';
    marked.push(id);
    const n = store.find((x) => x.id === id);
    if (!n) {
      await route.fulfill({ status: 404, json: { error: 'notification_not_found' } });
      return;
    }
    if (n.status === 'unread') {
      n.status = 'read';
      n.readAt = new Date().toISOString();
    }
    await route.fulfill({ json: { notification: n } });
  });

  await page.route(/\/notifications(\?.*)?$/, async (route) => {
    await route.fulfill({
      json: {
        items: [...store],
        total: store.length,
        unreadCount: unreadCount(),
        page: 1,
        limit: 25,
      },
    });
  });

  return { markedRead: () => [...marked], readAllCalls: () => readAll };
}

/**
 * Open a PrimeNG `p-select` (identified by its `inputId`) and pick an option by
 * its visible label. The overlay renders its options to `document.body`.
 */
export async function selectOption(page: Page, inputId: string, label: string): Promise<void> {
  await page.locator(`p-select:has(#${inputId})`).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

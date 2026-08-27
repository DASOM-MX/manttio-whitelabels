import { expect, type Page } from '@playwright/test';
import type { GenericQueryResponse } from '../../src/app/data/dtos/generic-query-response';

/**
 * Shared machinery for the list-pagination guard (21 CP-6).
 *
 * Every lazy list page in superadmin is the same three parts — a
 * `ListQueryService`, a `[lazy]` `p-table` and a `GenericQueryResponse` read —
 * so the regression guard is one scenario parameterized per page rather than
 * nine hand-written specs.
 */

/** Rows per page, mirroring `ListQueryService.PAGE_SIZE`. */
export const ROWS_PER_PAGE = 10;

/** The dev API origin every superadmin HTTP call goes to
 *  (`environment.development.ts`). Routes are anchored on it deliberately: a
 *  bare `/customers` regex also matches the SPA's own document navigation, and
 *  fulfilling a page navigation with JSON white-screens the test. */
export const API_ORIGIN = 'http://127.0.0.1:8788';

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Exactly this API path, with or without a query string — never a sibling.
 *  `/services` must not answer for `/services/all` or `/service-orders`. */
const endpointPattern = (path: string) =>
  new RegExp(`^${escapeRegExp(API_ORIGIN + path)}(\\?.*)?$`);

/**
 * Catch-all for the API host, so no unstubbed call reaches a dev backend that
 * would answer the fake e2e token with a real 401 — the interceptor logs the
 * session out mid-test. Register it FIRST: later routes win in Playwright, so
 * `signIn`'s stubs and the per-test list stub both keep precedence over this.
 */
export async function stubIdleApi(page: Page): Promise<void> {
  await page.route(`${API_ORIGIN}/**`, (route) =>
    route.fulfill({ json: { items: [], total: 0, page: 1, limit: ROWS_PER_PAGE } }),
  );
}

export interface PagedCalls {
  /** Query strings the list endpoint was called with, in order. */
  all(): URLSearchParams[];
  /** The most recent one, or undefined if the endpoint was never hit. */
  last(): URLSearchParams | undefined;
}

/**
 * Stub one paged endpoint over a fixed row set, **honouring `page`/`limit`**.
 * A stub that replayed the whole store on every request would let the exact
 * regression this guard exists for — a backend that ignores `page` — pass
 * green, which is how the clients list shipped broken in the first place
 * (21 §1).
 */
export async function mockPagedEndpoint<T>(
  page: Page,
  path: string,
  rows: readonly T[],
): Promise<PagedCalls> {
  const calls: URLSearchParams[] = [];

  await page.route(endpointPattern(path), async (route) => {
    const url = new URL(route.request().url());
    calls.push(url.searchParams);

    const pageNum = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
    const limit = Math.max(1, Number(url.searchParams.get('limit') ?? '10') || 10);
    const start = (pageNum - 1) * limit;

    const body: GenericQueryResponse<T> = {
      items: rows.slice(start, start + limit) as T[],
      total: rows.length,
      page: pageNum,
      limit,
    };
    await route.fulfill({ json: body });
  });

  return { all: () => calls, last: () => calls.at(-1) };
}

export interface PagedListCase<T> {
  /** SPA route the list renders at. */
  route: string;
  /** API path it reads. */
  endpoint: string;
  /** At least `ROWS_PER_PAGE + 1` rows — page 2 needs something to show. */
  rows: readonly T[];
  /** Text of the row's **first cell**, which is what the assertion reads: it
   *  pins *which* row leads the table, not merely that some row rendered. */
  firstCell: (row: T) => string;
}

/**
 * The guard itself: turn to page 2 and prove all three layers moved — the URL
 * carries the page (so browser back walks the history), the client asked the
 * server for it, and the rows on screen are page 2's.
 *
 * The last part is the one that matters. PrimeNG in lazy mode always slices
 * `[0, rows)` of whatever it was handed, so a list whose request never carried
 * `page=2` re-renders page 1 and looks perfectly healthy.
 */
export async function expectServerSidePaging<T>(
  page: Page,
  list: PagedListCase<T>,
): Promise<void> {
  const calls = await mockPagedEndpoint(page, list.endpoint, list.rows);

  await page.goto(list.route);

  const leadCell = page.locator('.p-datatable-tbody > tr').first().locator('td').first();
  await expect(leadCell).toContainText(list.firstCell(list.rows[0]!));

  // The paginator's page buttons are the labels 1..n, so nth(1) is "2".
  const pageTwo = page.locator('.p-paginator-page').nth(1);
  await expect(pageTwo).toBeVisible();
  await pageTwo.click();

  await expect(page).toHaveURL(/[?&]page=2(&|$)/);
  await expect(leadCell).toContainText(list.firstCell(list.rows[ROWS_PER_PAGE]!));

  const last = calls.last();
  expect(last?.get('page')).toBe('2');
  expect(last?.get('limit')).toBe(String(ROWS_PER_PAGE));
}

/** The one envelope every paginated/query read answers with (21 §2, and
 *  02-app-shell.md §6). List requests carry `page`/`limit` (+ per-module
 *  filters) via `toParams`.
 *
 *  `total` is the count of rows matching the filter, **never** `items.length` —
 *  that equation is what let the clients list fake a page count while serving
 *  the same rows on every page.
 *
 *  Envelopes carrying extra fields derive a named `*QueryResponse` interface
 *  from this one (see `NotificationQueryResponse`), never an intersection
 *  spelled out at the use site. */
export interface GenericQueryResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

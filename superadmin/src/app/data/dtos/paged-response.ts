/** Standard envelope for every paginated list endpoint (02-app-shell.md §6).
 *  List requests carry `page`/`limit` (+ per-module filters) via `toParams`. */
export interface PagedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

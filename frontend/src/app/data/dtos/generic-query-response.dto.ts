/** The one envelope every paginated/query read answers with (21 §2).
 *
 *  `total` is the count of rows matching the filter, **never** `items.length`.
 *
 *  Cross-resource by design, so it sits at the root of `dtos/` rather than in
 *  a per-resource folder, and is imported directly — no barrel. */
export interface GenericQueryResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

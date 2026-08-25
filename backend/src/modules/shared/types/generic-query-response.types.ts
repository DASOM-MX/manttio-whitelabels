/** The one envelope every paginated/query read answers with — repository,
 *  service and wire alike (21 §2).
 *
 *  Before this existed the same shape was hand-written ~20 times across the
 *  repo, which is how `GET /customers` came to report `total: items.length`
 *  with nothing to catch it. `total` is the count of rows matching the filter,
 *  **never** `items.length` — treat that equation in review as a defect.
 *
 *  Envelopes carrying extra fields derive a named `*QueryResponse` interface
 *  from this one in their owning module (see `NotificationQueryResponse`),
 *  never an intersection spelled out at the use site. */
export interface GenericQueryResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

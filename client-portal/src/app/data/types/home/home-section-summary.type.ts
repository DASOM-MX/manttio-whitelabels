/** One Inicio card's data (04 §8) — a section's total count plus its two
 *  most recent items, read off the same `GenericQueryResponse<T>` the
 *  section's own list page paginates on. Client-only aggregate, never sent
 *  over the wire as such. */
export interface HomeSectionSummary<T> {
  total: number;
  items: T[];
}

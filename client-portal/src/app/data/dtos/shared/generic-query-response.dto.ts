/** The one envelope every portal list answers with (backend
 *  `GenericQueryResponse<T>`, 04 §1). `total` is the count of rows matching
 *  the filter, paginate off it — never `items.length`. */
export interface GenericQueryResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

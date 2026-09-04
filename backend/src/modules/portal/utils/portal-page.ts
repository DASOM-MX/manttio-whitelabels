import type { GenericQueryResponse } from '../../shared/types/generic-query-response.types';

/** Re-map a page's items and keep its envelope. Every portal list service turns
 *  rows into DTOs, and `total`/`page`/`limit` must survive untouched —
 *  rebuilding the envelope by hand is how `total` becomes `items.length`. */
export const mapPage = <TIn, TOut>(
  page: GenericQueryResponse<TIn>,
  map: (item: TIn) => TOut,
): GenericQueryResponse<TOut> => ({ ...page, items: page.items.map(map) });

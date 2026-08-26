/** Route-param constraint for uuid path segments.
 *
 *  Hono matches routes in registration order, so a bare `/:id` will happily
 *  capture a static sibling like `/all` if the sibling is ever declared below
 *  it. Constraining the param makes that impossible by construction: a segment
 *  that is not a uuid simply does not match the route, and falls through to the
 *  global `notFound` in `src/index.ts` — the same `{ error: 'not_found' }` 404
 *  the hand-written `z.string().uuid()` guards return.
 *
 *  It also stops a malformed id reaching Postgres, where the cast to `uuid`
 *  throws 22P02 and surfaces as an uncaught 500 instead of a 404.
 *
 *  Usage — the path must be a template literal:
 *    `reports.get(\`/:id{${UUID_PARAM}}/pdf\`, handler)`
 *
 *  Access tokens (`/reports/download/:token`, the public quotation routes) are
 *  high-entropy strings, not uuids — they are deliberately left unconstrained.
 */
export const UUID_PARAM =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

import { RenderMode, ServerRoute } from '@angular/ssr';

/** Every route renders in the browser (plan 25 §intro).
 *
 *  The Worker exists to own the request path and serve `GET /__config` and the
 *  dynamic PWA manifest, not to render. Nothing is server-rendered today, which
 *  is what keeps the migration small: no feature area, PrimeNG, NGXS-storage or
 *  Dexie needs SSR-safety work, and no guard or initializer ever executes in a
 *  server runtime.
 *
 *  The schematic's default here is `Prerender`, which would execute the whole
 *  app under Node at build time — deliberately replaced.
 *
 *  Individual routes can be flipped to `RenderMode.Server` later without
 *  touching the deploy topology; that is the entire reason the SSR toolchain is
 *  installed now rather than a bare assets Worker. */
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Client,
  },
];

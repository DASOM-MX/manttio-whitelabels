import { AngularAppEngine } from '@angular/ssr';

const angularApp = new AngularAppEngine();

interface Env {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
  API_URL?: string;
  TURNSTILE_SITE_KEY?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // The `/__config` endpoint serves the runtime config containing the API host.
    // This must be answered BEFORE delegating to the Angular app engine, which
    // would return a 302 redirect on unrecognized paths — we need to serve the
    // literal response, not redirect to the shell (plan 25 §3).
    if (new URL(request.url).pathname === '/__config') {
      return new Response(
        JSON.stringify({
          // Both vars are dashboard-set per tenant. If unset, return null
          // (not a fallback) — the app's config chain falls through to
          // localStorage then gives up, leaving the value empty. An unset var is
          // not a bug to paper over; it's a signal to the operator.
          apiUrl: env.API_URL ?? null,
          // Public by design — it ships inside the widget — but per-tenant, so
          // it belongs here rather than compiled into the bundle.
          turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? null,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    // Everything else goes to the Angular app engine.
    // Since all routes are `RenderMode.Client`, this just serves the CSR shell.
    const response = await angularApp.handle(request);
    return response || new Response('Not found', { status: 404 });
  },
};

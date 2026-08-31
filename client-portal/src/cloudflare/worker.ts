import { AngularAppEngine } from '@angular/ssr';

const angularApp = new AngularAppEngine();

interface Env {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
  API_URL?: string;
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
          apiUrl: env.API_URL || 'https://manttio-api.dasom-mx.workers.dev',
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

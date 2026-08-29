import { AngularAppEngine } from '@angular/ssr';
import { brandManifest } from './worker/brand-manifest';

/** Cloudflare bindings this Worker reads.
 *
 *  `API_URL` is a plain dashboard environment variable, not a secret: it ships
 *  to every browser regardless, and encrypting it would only cost the ability
 *  to read it back while debugging a deploy (plan 25 §2). One variable serves
 *  both routes below — the Pages deployment needed a second `API_BASE_URL` for
 *  the manifest function, which is gone. */
interface Env {
  API_URL?: string;
}

const angularApp = new AngularAppEngine();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Both routes are answered *before* the engine is consulted. The engine
    // matches unknown paths against the Angular router, which 302s them to `/`
    // — delegating first would lose them entirely (verified at CP-2).
    if (url.pathname === '/__config') {
      // `no-store` is what makes a dashboard change take effect on the next
      // page load instead of the next build. It is the whole point of plan 25.
      // An unset binding yields `null`, which the client rejects and falls
      // back from, rather than pinning the app to a broken host.
      return new Response(JSON.stringify({ apiUrl: env.API_URL ?? null }), {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    }

    if (url.pathname === '/manifest.webmanifest') {
      return brandManifest(env.API_URL);
    }

    // Static assets never reach here — Cloudflare serves a matching asset first
    // and only invokes the Worker when none matches, so this handles the CSR
    // shell for `/` and every deep link. That is also what replaced
    // `public/_redirects`, which the deploy API rejects outright (25 CP-4).
    return (await angularApp.handle(request)) ?? new Response('Not found', { status: 404 });
  },
};

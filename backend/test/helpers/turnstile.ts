import { env } from 'cloudflare:test';
import { afterAll, afterEach, beforeAll } from 'vitest';

// Fetch interceptor for Cloudflare's Turnstile siteverify endpoint, modeled on
// helpers/resend.ts. Verdict defaults to pass; flip it per-test with
// setTurnstileVerdict(false) — afterEach resets to pass. The intercepted URL
// comes from the same wrangler var the service reads, so a config change never
// desyncs the mock.

const siteverifyUrl = (env as { TURNSTILE_SITEVERIFY_URL: string }).TURNSTILE_SITEVERIFY_URL;

let verdict = true;
let realFetch: typeof fetch | null = null;

const mockedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = input instanceof Request ? input.url : input.toString();
  if (url.startsWith(siteverifyUrl)) {
    return new Response(
      JSON.stringify({
        success: verdict,
        'error-codes': verdict ? [] : ['invalid-input-response'],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }
  if (!realFetch) throw new Error('turnstile mock: realFetch not captured');
  return realFetch(input as RequestInfo, init);
};

// Call inside a `describe` (or at module top level) to intercept Turnstile HTTP
// traffic for the duration of the test file. Real fetch is restored in `afterAll`.
export const mockTurnstile = () => {
  beforeAll(() => {
    realFetch = globalThis.fetch;
    globalThis.fetch = mockedFetch as typeof fetch;
  });
  afterEach(() => {
    verdict = true;
  });
  afterAll(() => {
    if (realFetch) globalThis.fetch = realFetch;
    realFetch = null;
  });
};

export const setTurnstileVerdict = (v: boolean) => {
  verdict = v;
};

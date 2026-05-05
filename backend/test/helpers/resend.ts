import { afterAll, afterEach, beforeAll } from 'vitest';

export type CapturedSend = {
  from: string;
  to: string;
  cc?: string[];
  subject: string;
  html: string;
  text: string;
  reply_to?: string;
};

const captures: CapturedSend[] = [];
let realFetch: typeof fetch | null = null;

const RESEND_HOST = 'https://api.resend.com';

const mockedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = input instanceof Request ? input.url : input.toString();
  if (url.startsWith(RESEND_HOST)) {
    const raw =
      input instanceof Request
        ? await input.clone().text()
        : typeof init?.body === 'string'
          ? init.body
          : '';
    if (raw) captures.push(JSON.parse(raw) as CapturedSend);
    return new Response(JSON.stringify({ id: `mock-resend-${Date.now()}` }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (!realFetch) throw new Error('resend mock: realFetch not captured');
  return realFetch(input as RequestInfo, init);
};

// Call inside a `describe` (or at module top level) to intercept Resend HTTP traffic
// for the duration of the test file. Real fetch is restored in `afterAll`.
export const mockResend = () => {
  beforeAll(() => {
    realFetch = globalThis.fetch;
    globalThis.fetch = mockedFetch as typeof fetch;
  });
  afterEach(() => {
    captures.length = 0;
  });
  afterAll(() => {
    if (realFetch) globalThis.fetch = realFetch;
    realFetch = null;
  });
};

export const lastResendSend = (): CapturedSend | undefined => captures[captures.length - 1];

export const allResendSends = (): readonly CapturedSend[] => captures;

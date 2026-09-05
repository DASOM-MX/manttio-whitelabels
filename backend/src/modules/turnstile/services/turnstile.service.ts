// Thin Cloudflare Turnstile siteverify wrapper (email/-transport pattern — no
// SDK, fetch is enough). Endpoint + secret come straight from env
// (TURNSTILE_SITEVERIFY_URL is a wrangler var so a Cloudflare URL change is a
// config edit, not a code change). Fails closed: an unreachable or non-2xx
// siteverify answers as an unsuccessful verification, never a thrown error.

import type { Env } from '../../../env';
import type { SiteverifyResponse, TurnstileVerifyResult } from '../types/turnstile.types';

export const verifyTurnstileToken = async (
  env: Env,
  token: string,
  remoteIp?: string,
): Promise<TurnstileVerifyResult> => {
  // Local-only escape hatch, so `wrangler dev` can exercise the login flows
  // without a Turnstile account. The flag lives exclusively in `.dev.vars`,
  // which is gitignored and is never uploaded by `wrangler deploy` — a deployed
  // Worker has no way to have it set.
  //
  // Deliberately NOT keyed on `ENVIRONMENT`: wrangler.toml's top-level
  // `[vars]` sets it to "dev", and only `--env production` overrides, so a
  // plain `wrangler deploy` of manttio-api runs as "dev" too. That check would
  // have turned bot protection off on a live public API.
  if (env.DEV_SKIP_TURNSTILE === 'true') {
    console.warn('[turnstile] verification SKIPPED — DEV_SKIP_TURNSTILE is set');
    return { success: true, errorCodes: [] };
  }

  try {
    const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);
    const res = await fetch(env.TURNSTILE_SITEVERIFY_URL, { method: 'POST', body });
    if (!res.ok) return { success: false, errorCodes: ['siteverify_unreachable'] };
    const data = (await res.json()) as SiteverifyResponse;
    return { success: data.success, errorCodes: data['error-codes'] ?? [] };
  } catch {
    return { success: false, errorCodes: ['siteverify_unreachable'] };
  }
};

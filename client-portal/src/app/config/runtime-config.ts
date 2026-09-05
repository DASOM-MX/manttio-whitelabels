import { environment } from '../../environments/environment';
import type { RuntimeOverrides } from '../data/types/config/runtime-overrides';

/** Runtime configuration, resolved at boot (plan 25, 03 §6).
 *
 *  In production both `apiUrl` and `turnstileSiteKey` come from Cloudflare env
 *  vars, served by the Worker at `GET /__config` and read once before the app
 *  starts — `environment.ts` ships them **empty**, so a tenant's host is never
 *  compiled in.
 *
 *  `environment.development.ts` (owner, 2026-09-05) supersedes the original
 *  "no compiled literal at all" rule: under `ng serve` there is no Worker, so
 *  `/__config` answers with the SPA shell and every earlier rung fails by
 *  design. The dev literal is the only thing that makes local work, and it is
 *  the same mechanism superadmin uses.
 *
 *  This is a mutable module object rather than a DI token or signal on purpose:
 *  every consumer reads it lazily (see the `base` getters in the http services),
 *  so there is nothing to notify — by the time any request is built,
 *  `loadRuntimeConfig()` has already resolved. */
const CONFIG_ENDPOINT = '/__config';
const CONFIG_TIMEOUT_MS = 3000;
const STORAGE_KEY = 'runtime.config';

/** Starts as the compiled defaults — empty in a production build, the local
 *  API under `ng serve`. `loadRuntimeConfig()` overlays the edge's answer on
 *  top. Never reassigned: consumers hold this reference. An empty `apiUrl`
 *  still means "not known yet", and the app must not proceed with a guess. */
export const runtimeConfig: RuntimeOverrides = {
  apiUrl: environment.apiUrl,
  turnstileSiteKey: environment.turnstileSiteKey,
};

/** Applies an override set, ignoring anything malformed. Returns whether
 *  anything was actually taken.
 *
 *  All-or-nothing on purpose: `apiUrl` stays the gate, and the site key rides
 *  along from the same source. Applying them independently would let a stale
 *  cached key overwrite a fresh one when only the host was missing. */
function apply(overrides: RuntimeOverrides | null | undefined): boolean {
  const apiUrl = overrides?.apiUrl;
  if (typeof apiUrl !== 'string' || !apiUrl.trim()) return false;
  runtimeConfig.apiUrl = apiUrl.trim();
  const siteKey = overrides?.turnstileSiteKey;
  // Unset stays empty rather than keeping a previous value: no key means the
  // auth pages refuse to draw a widget, which is the signal the operator needs.
  runtimeConfig.turnstileSiteKey = typeof siteKey === 'string' ? siteKey.trim() : '';
  return true;
}

/** Last known-good config. Storage access is guarded: it throws outright in
 *  some privacy modes, and a boot must never die on that. */
function readCached(): RuntimeOverrides | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RuntimeOverrides) : null;
  } catch {
    return null;
  }
}

function writeCached(overrides: RuntimeOverrides): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    /* storage unavailable — the fetch still applied, this boot is fine */
  }
}

/** Resolve runtime config before the app boots. Fallback chain (25 §3):
 *  `/__config` → last known-good from storage → the compiled literal.
 *
 *  Never rejects. Every rung failing is a supported state — a network failure,
 *  an unset Worker var, corrupted localStorage, or simply `ng serve`, where
 *  there is no Worker and the dev literal is meant to win. An empty `apiUrl`
 *  means the app must not attempt requests; an empty `turnstileSiteKey` means
 *  the public auth pages must not draw a challenge. */
export async function loadRuntimeConfig(): Promise<void> {
  try {
    const res = await fetch(CONFIG_ENDPOINT, {
      // A hung request must not hold the app hostage; see 25 §3.
      signal: AbortSignal.timeout(CONFIG_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    // A 200 response is authoritative. If it carries a valid apiUrl, apply it.
    // If it's malformed, the apply() call silently rejects it and the next rung
    // (storage) is tried. Under `ng serve` this resolves 200 with the SPA
    // shell, so `.json()` throwing is the normal dev path, not an error.
    if (res.ok && apply(await res.json())) {
      writeCached({
        apiUrl: runtimeConfig.apiUrl,
        turnstileSiteKey: runtimeConfig.turnstileSiteKey,
      });
      return;
    }
  } catch {
    /* network error, timeout, or JSON parse failure — try the cache */
  }

  apply(readCached());
}

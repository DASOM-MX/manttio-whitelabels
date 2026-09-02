import type { RuntimeOverrides } from '../data/types/config/runtime-overrides';

/** Runtime configuration, resolved at boot (plan 25, 03 §6).
 *
 *  Neither `apiUrl` nor `turnstileSiteKey` is compiled into this app — both come
 *  from Cloudflare env vars, served by the Worker at `GET /__config` and read
 *  once before the app starts.
 *  No `environment.ts` file exists here (fork rule: the portal is born on the far
 *  side of the Pages→Workers migration, with no compiled literal to migrate away
 *  from).
 *
 *  This is a mutable module object rather than a DI token or signal on purpose:
 *  every consumer reads it lazily (see the `base` getters in the http services),
 *  so there is nothing to notify — by the time any request is built,
 *  `loadRuntimeConfig()` has already resolved. */
const CONFIG_ENDPOINT = '/__config';
const CONFIG_TIMEOUT_MS = 3000;
const STORAGE_KEY = 'runtime.config';

/** Starts empty; `loadRuntimeConfig()` fills it from the edge, storage, or (if
 *  both fail) leaves it empty. Empty means the value is not known yet — the app
 *  must not proceed with a guess, for either field. */
export const runtimeConfig: RuntimeOverrides = { apiUrl: '', turnstileSiteKey: '' };

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
 *  `/__config` → last known-good from storage → empty (no guessing).
 *
 *  Never rejects. Every rung failing is a supported state — a network failure,
 *  an unset Worker var, or corrupted localStorage. An empty `apiUrl` means the
 *  app must not attempt requests; an empty `turnstileSiteKey` means the public
 *  auth pages must not draw a challenge. */
export async function loadRuntimeConfig(): Promise<void> {
  try {
    const res = await fetch(CONFIG_ENDPOINT, {
      // A hung request must not hold the app hostage; see 25 §3.
      signal: AbortSignal.timeout(CONFIG_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    // A 200 response is authoritative. If it carries a valid apiUrl, apply it.
    // If it's malformed, the apply() call silently rejects it and the next rung
    // (storage) is tried.
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

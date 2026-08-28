import { environment } from '../../environments/environment';
import type { RuntimeOverrides } from '../data/types/config/runtime-overrides';

/** Runtime configuration, resolved at boot (plan 25).
 *
 *  `apiUrl` used to be compiled into the bundle, which meant one build per
 *  tenant API host. It now comes from a Cloudflare env var, served by the
 *  Worker at `GET /__config` and read once before the app starts.
 *
 *  This is a mutable module object rather than a DI token or signal on
 *  purpose: every consumer reads it lazily (see the `base` getters in the
 *  http services), so there is nothing to notify — by the time any request is
 *  built, `loadRuntimeConfig()` has already resolved. */
const CONFIG_ENDPOINT = '/__config';
const CONFIG_TIMEOUT_MS = 3000;
const STORAGE_KEY = 'runtime.config';

/** Starts as the compiled defaults; `loadRuntimeConfig()` overlays the edge's
 *  answer on top. Never reassigned — consumers hold this reference. */
export const runtimeConfig = { ...environment };

/** Applies an override set, ignoring anything malformed. Returns whether
 *  anything was actually taken. */
function apply(overrides: RuntimeOverrides | null | undefined): boolean {
  const apiUrl = overrides?.apiUrl;
  if (typeof apiUrl !== 'string' || !apiUrl.trim()) return false;
  runtimeConfig.apiUrl = apiUrl.trim();
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
 *  Never rejects. Every rung failing is a supported state — it is exactly what
 *  happens under `ng serve`, where there is no Worker and `environment.
 *  development.ts` is meant to win. */
export async function loadRuntimeConfig(): Promise<void> {
  try {
    const res = await fetch(CONFIG_ENDPOINT, {
      // A hung request must not hold the app hostage; see 25 §3.
      signal: AbortSignal.timeout(CONFIG_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    // Under `ng serve` this resolves 200 with the SPA shell, so `.json()`
    // throwing is the normal dev path, not an error worth logging.
    if (res.ok && apply(await res.json())) {
      writeCached({ apiUrl: runtimeConfig.apiUrl });
      return;
    }
  } catch {
    /* offline, timed out, or no Worker in front of us — try the cache */
  }

  apply(readCached());
}

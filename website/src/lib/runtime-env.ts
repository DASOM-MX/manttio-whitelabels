// Runtime-first env resolution (utm-params plan 02 CP-1), the resolveBaseUrl
// pattern generalized: the wrangler var (per-tenant deploy value) wins over
// the build-time PUBLIC_ inline; null → the caller renders its fallback.

export async function resolveRuntimeVar(
  name: string,
  publicFallbackKey: string,
): Promise<string | null> {
  let runtimeValue: string | undefined;
  try {
    // Astro v6 way to reach Workers bindings; throws outside the CF runtime.
    const { env } = await import('cloudflare:workers');
    runtimeValue = (env as Record<string, string | undefined>)[name];
  } catch {
    runtimeValue = undefined;
  }
  const raw = runtimeValue ?? import.meta.env[publicFallbackKey];
  if (!raw || typeof raw !== 'string') return null;
  return raw;
}

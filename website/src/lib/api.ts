// Typed fetchers against the whitelabeled backend (plan 15 §1).
// Every read fails soft: timeout, non-2xx, or malformed payload → null → the
// caller falls back to the brand-neutral defaults and the site still renders.

import { DEFAULT_BRAND, DEFAULT_CLIENTS, DEFAULT_HOME } from './defaults';
import type { Brand, CmsClient, CmsHome, FontCatalogEntry, SiteData } from './types';

const FETCH_TIMEOUT_MS = 5_000;

async function fetchJson<T>(baseUrl: string, path: string): Promise<T | null> {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface RuntimeEnv {
  API_BASE_URL?: string;
}

async function resolveBaseUrl(): Promise<string | null> {
  // Runtime binding (wrangler var, per-tenant) wins over the build-time public var.
  let runtimeUrl: string | undefined;
  try {
    // Astro v6 way to reach Workers bindings; throws outside the CF runtime.
    const { env } = await import('cloudflare:workers');
    runtimeUrl = (env as RuntimeEnv).API_BASE_URL;
  } catch {
    runtimeUrl = undefined;
  }
  const raw = runtimeUrl ?? import.meta.env.PUBLIC_API_BASE_URL;
  if (!raw || typeof raw !== 'string') return null;
  return raw.replace(/\/$/, '');
}

// Blank means "unset" throughout the brand contract — the backend's neutral
// default (pre-provisioning) ships name '' — so drop blank/null fields before
// merging or they'd clobber the built-in fallbacks with emptiness.
function withoutBlanks<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== '' && value != null),
  ) as Partial<T>;
}

export async function getSiteData(): Promise<SiteData> {
  const baseUrl = await resolveBaseUrl();
  if (!baseUrl) {
    return { brand: DEFAULT_BRAND, home: DEFAULT_HOME, clients: DEFAULT_CLIENTS, fonts: [], live: false };
  }

  const [brand, fonts, home, clients] = await Promise.all([
    fetchJson<Brand>(baseUrl, '/brand'),
    fetchJson<FontCatalogEntry[]>(baseUrl, '/fonts'),
    // Published-only public routes — shape is the backend's call (plan 15 §1.1).
    fetchJson<CmsHome>(baseUrl, '/public/cms/home'),
    fetchJson<CmsClient[]>(baseUrl, '/public/cms/clients'),
  ]);

  return {
    brand: brand ? { ...DEFAULT_BRAND, ...withoutBlanks(brand) } : DEFAULT_BRAND,
    home: home ?? DEFAULT_HOME,
    clients: clients?.length ? clients : DEFAULT_CLIENTS,
    fonts: fonts ?? [],
    live: Boolean(brand || home || clients),
  };
}

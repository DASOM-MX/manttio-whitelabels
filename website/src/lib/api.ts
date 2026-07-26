// Typed fetchers against the whitelabeled backend (plan 15 §1).
// Every read fails soft: timeout, non-2xx, or malformed payload → null → the
// caller falls back to the brand-neutral defaults and the site still renders.

import { DEFAULT_BRAND, DEFAULT_CLIENTS, DEFAULT_HOME } from './defaults';
import { resolveRuntimeVar } from './runtime-env';
import type {
  Brand,
  CmsClient,
  CmsHome,
  FontCatalogEntry,
  PublicService,
  SiteData,
} from './types';

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

export async function resolveBaseUrl(): Promise<string | null> {
  // Runtime binding (wrangler var, per-tenant) wins over the build-time public var.
  const raw = await resolveRuntimeVar('API_BASE_URL', 'PUBLIC_API_BASE_URL');
  return raw ? raw.replace(/\/$/, '') : null;
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
    return {
      brand: DEFAULT_BRAND,
      home: DEFAULT_HOME,
      clients: DEFAULT_CLIENTS,
      services: [],
      fonts: [],
      live: false,
    };
  }

  const [brand, fonts, home, clients, services] = await Promise.all([
    fetchJson<Brand>(baseUrl, '/brand'),
    fetchJson<FontCatalogEntry[]>(baseUrl, '/fonts'),
    // Published-only public routes — shape is the backend's call (plan 15 §1.1).
    fetchJson<CmsHome>(baseUrl, '/public/cms/home'),
    fetchJson<CmsClient[]>(baseUrl, '/public/cms/clients'),
    // Published service catalog (18 §4). Unlike the CMS reads this never 404s —
    // an empty catalog is a 200 with `[]`, so null here means a real failure.
    fetchJson<{ services: PublicService[] }>(baseUrl, '/public/services'),
  ]);

  return {
    brand: brand ? { ...DEFAULT_BRAND, ...withoutBlanks(brand) } : DEFAULT_BRAND,
    home: home ?? DEFAULT_HOME,
    clients: clients?.length ? clients : DEFAULT_CLIENTS,
    // No brand-neutral fallback: an invented price list would be worse than no
    // section at all, so a failed read renders exactly like an empty catalog.
    services: services?.services ?? [],
    fonts: fonts ?? [],
    live: Boolean(brand || home || clients || services),
  };
}

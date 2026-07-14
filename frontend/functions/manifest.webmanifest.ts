// Cloudflare Pages Function: serves the PWA manifest fresh at runtime from the
// tenant brand (plan 02 §2). The service worker prefetches manifests as
// statics and runtime JS can't swap them, so the static file is gone and this
// same-origin route answers /manifest.webmanifest instead. Brand absent or
// unreachable → the neutral manifest (bundled /icons fallback set, rule 5).
//
// Requires the Pages project env var API_BASE_URL (the tenant backend). The
// icon set is backend-generated from the tenant mark on brand save (decided
// 2026-07-12) and arrives as materialized CDN URLs on GET /brand.
//
// Known caveat of any dynamic-manifest approach: browsers cache the manifest —
// installed-app identity refreshes on the next manifest fetch, and an
// already-installed home-screen icon only updates on reinstall.

type BrandIcons = {
  any192?: string;
  any512?: string;
  maskable192?: string;
  maskable512?: string;
};

type Brand = {
  name?: string;
  description?: string;
  colors?: {
    primary?: Record<string, string>;
    surface?: Record<string, string>;
  };
  icons?: BrandIcons;
};

type ManifestIcon = { src: string; sizes: string; type: string; purpose: string };

type RouteContext = { env: { API_BASE_URL?: string } };

// "H S% L%" components (branding rule 2) → hex; the manifest is parsed by
// installers, so hex is the conservative choice. Null on anything else.
const hslToHex = (value: string | undefined): string | null => {
  const m = /^(\d{1,3}(?:\.\d+)?) (\d{1,3}(?:\.\d+)?)% (\d{1,3}(?:\.\d+)?)%$/.exec(
    value?.trim() ?? '',
  );
  if (!m) return null;
  const h = Number(m[1]);
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  if (h > 360 || s > 1 || l > 1) return null;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const hue = (h % 360) / 60;
  const x = chroma * (1 - Math.abs((hue % 2) - 1));
  const base = l - chroma / 2;
  const table: Array<[number, number, number]> = [
    [chroma, x, 0], [x, chroma, 0], [0, chroma, x],
    [0, x, chroma], [x, 0, chroma], [chroma, 0, x],
  ];
  const [r, g, b] = table[Math.floor(hue) % 6]!;
  const channel = (n: number) =>
    Math.round(Math.min(1, Math.max(0, n + base)) * 255).toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
};

const NEUTRAL_ICONS: ManifestIcon[] = [
  { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: 'icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
  { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
];

const brandIcons = (icons: BrandIcons | undefined): ManifestIcon[] | null => {
  if (!icons?.any192 || !icons.any512 || !icons.maskable192 || !icons.maskable512) return null;
  return [
    { src: icons.any192, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: icons.any512, sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: icons.maskable192, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: icons.maskable512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ];
};

export const onRequestGet = async (ctx: RouteContext): Promise<Response> => {
  // Neutral defaults mirror index.html's pre-fetch values.
  const manifest: Record<string, unknown> = {
    name: 'Manttio',
    short_name: 'Manttio',
    description: 'Reportes de mantenimiento en campo',
    lang: 'es',
    dir: 'ltr',
    display: 'standalone',
    orientation: 'portrait',
    scope: '/',
    start_url: '/',
    theme_color: '#40454F',
    background_color: '#FFFFFF',
    icons: NEUTRAL_ICONS,
  };

  const apiBase = ctx.env.API_BASE_URL?.replace(/\/$/, '');
  if (apiBase) {
    try {
      const res = await fetch(`${apiBase}/brand`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const brand = (await res.json()) as Brand;
        const name = brand.name?.trim();
        if (name) {
          manifest['name'] = name;
          manifest['short_name'] = name;
        }
        if (brand.description) manifest['description'] = brand.description;
        const theme = hslToHex(brand.colors?.primary?.['800']);
        if (theme) manifest['theme_color'] = theme;
        const background = hslToHex(brand.colors?.surface?.['0']);
        if (background) manifest['background_color'] = background;
        const icons = brandIcons(brand.icons);
        if (icons) manifest['icons'] = icons;
      }
    } catch {
      // fail-soft: the neutral manifest above
    }
  }

  return new Response(JSON.stringify(manifest), {
    headers: {
      'content-type': 'application/manifest+json',
      // Browsers cache manifests on their own; keep the edge copy short-lived
      // so a re-provisioned brand shows up on the next fetch.
      'cache-control': 'public, max-age=300',
    },
  });
};

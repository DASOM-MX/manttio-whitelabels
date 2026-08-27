// Brand → CSS: :root custom properties for the Tailwind + PrimeNG palette
// repoint, plus @font-face rules for catalog fonts — a client-side port of
// website/src/lib/theme.ts::buildBrandCss (plan 02 §1.2). Emits only what the
// fetched brand actually carries — an empty string means "run on the built-in
// fallbacks". Scale values arrive as HSL components ("H S% L%", steps 0…1000 —
// branding rule 2) and drop into the vars verbatim; anything else (hex, rgb)
// is skipped. Unlike the website, the app bundles no catalog font, so every
// brand font code with a hosted woff2 gets a @font-face (no default-code skip).

import type { Brand, HslScale, FontCatalogEntry } from '../data/dtos/brand';

const HSL_COMPONENTS_RE = /^\d{1,3}(?:\.\d+)? \d{1,3}(?:\.\d+)?% \d{1,3}(?:\.\d+)?%$/;

function scaleVars(prefix: string, scale: HslScale | undefined): string[] {
  if (!scale) return [];
  const vars: string[] = [];
  for (const [step, value] of Object.entries(scale)) {
    const components = value.trim();
    if (HSL_COMPONENTS_RE.test(components) && /^\d{1,4}$/.test(step)) {
      vars.push(`--brand-${prefix}-${step}: ${components};`);
    }
  }
  return vars;
}

function cssEscape(value: string): string {
  return value.replace(/["\\<>]/g, '');
}

export function buildBrandCss(brand: Brand, fonts: FontCatalogEntry[]): string {
  const rootVars: string[] = [
    ...scaleVars('primary', brand.colors?.primary),
    ...scaleVars('accent', brand.colors?.accent),
  ];
  const fontFaces: string[] = [];

  for (const role of ['body', 'heading'] as const) {
    const code = brand.font?.[role] ?? (role === 'heading' ? brand.font?.body : undefined);
    if (!code) continue;
    const entry = fonts.find((f) => f.code === code);
    if (!entry?.files.variable) continue; // no hosted woff2 → built-in fallback
    const family = cssEscape(entry.label);
    fontFaces.push(
      `@font-face { font-family: "${family}"; src: url("${cssEscape(entry.files.variable)}") format("woff2"); font-weight: 100 900; font-style: normal; font-display: swap; }`,
    );
    const stack = entry.fallbackStack ?? 'ui-sans-serif, system-ui, sans-serif';
    rootVars.push(`--brand-font-${role}: "${family}", ${stack};`);
  }

  if (!rootVars.length && !fontFaces.length) return '';
  const rootBlock = rootVars.length ? `:root { ${rootVars.join(' ')} }` : '';
  return [rootBlock, ...fontFaces].join('\n');
}

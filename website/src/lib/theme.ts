// Brand → CSS: custom properties for the Tailwind palette repoint plus
// @font-face rules for catalog fonts (plan 15 §3). Emits only what the fetched
// brand actually carries — an empty string means "run on the built-in fallbacks".
// Scale values arrive as HSL components ("H S% L%", steps 0…1000 — branding
// rule 2) and drop into the vars verbatim; anything else (hex, rgb) is skipped.

import type { Brand, BrandColorScale, FontCatalogEntry } from './types';

const DEFAULT_FONT_CODES = { body: 'work_sans', heading: 'rubik' };

const HSL_COMPONENTS_RE = /^\d{1,3}(?:\.\d+)? \d{1,3}(?:\.\d+)?% \d{1,3}(?:\.\d+)?%$/;

function scaleVars(prefix: string, scale: BrandColorScale | undefined): string[] {
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
    ...scaleVars('surface', brand.colors?.surface),
  ];
  const fontFaces: string[] = [];

  for (const role of ['body', 'heading'] as const) {
    const code = brand.font?.[role] ?? (role === 'heading' ? brand.font?.body : undefined);
    if (!code || code === DEFAULT_FONT_CODES[role]) continue; // defaults ship via @fontsource
    const entry = fonts.find((f) => f.code === code);
    if (!entry?.files.variable) continue;
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

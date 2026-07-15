import { FontRole } from '../enums/brand.enum';
import type { FontCatalogSeed } from '../types/brand.types';

// Curated OFL variable-font catalog — launch set of 10, decided 2026-07-05
// (superadmin plan 03 §2.1). Constants-only: nothing font-related lives in
// Neon. Binaries sit in the dedicated shared `branding-fonts` R2 bucket
// (CDN-fronted, one copy for all tenants) as `<code>.woff2`; `files.variable`
// is materialized from FONT_CDN_BASE_URL at serve time. Append-only: adding a
// family is a new entry here + a bucket upload — no migration, no app deploy.
// Commissioner is deliberately excluded (the superadmin's own voice).

const SANS_FALLBACK = 'ui-sans-serif, system-ui, sans-serif';
const SERIF_FALLBACK = 'ui-serif, Georgia, serif';

const GROUP_DEFAULTS = 'Defaults';
const GROUP_NEUTRAL = 'Neutral / institucional';
const GROUP_WARM = 'Contemporánea / cálida';
const GROUP_HEADING = 'Carácter / títulos';

export const FONT_CATALOG: readonly FontCatalogSeed[] = [
  {
    code: 'work_sans',
    label: 'Work Sans',
    group: GROUP_DEFAULTS,
    roles: FontRole.Both,
    fallbackStack: SANS_FALLBACK,
    recommendedHeading: 'rubik',
  },
  {
    code: 'rubik',
    label: 'Rubik',
    group: GROUP_DEFAULTS,
    roles: FontRole.Both,
    fallbackStack: SANS_FALLBACK,
  },
  {
    code: 'inter',
    label: 'Inter',
    group: GROUP_NEUTRAL,
    roles: FontRole.Both,
    fallbackStack: SANS_FALLBACK,
    tnumVerified: true,
  },
  {
    code: 'public_sans',
    label: 'Public Sans',
    group: GROUP_NEUTRAL,
    roles: FontRole.Both,
    fallbackStack: SANS_FALLBACK,
  },
  {
    code: 'archivo',
    label: 'Archivo',
    group: GROUP_NEUTRAL,
    roles: FontRole.Both,
    fallbackStack: SANS_FALLBACK,
  },
  {
    code: 'figtree',
    label: 'Figtree',
    group: GROUP_WARM,
    roles: FontRole.Both,
    fallbackStack: SANS_FALLBACK,
  },
  {
    code: 'dm_sans',
    label: 'DM Sans',
    group: GROUP_WARM,
    roles: FontRole.Both,
    fallbackStack: SANS_FALLBACK,
  },
  {
    code: 'plus_jakarta',
    label: 'Plus Jakarta Sans',
    group: GROUP_WARM,
    roles: FontRole.Both,
    fallbackStack: SANS_FALLBACK,
  },
  {
    code: 'sora',
    label: 'Sora',
    group: GROUP_HEADING,
    roles: FontRole.Heading,
    fallbackStack: SANS_FALLBACK,
  },
  {
    code: 'source_serif',
    label: 'Source Serif 4',
    group: GROUP_HEADING,
    roles: FontRole.Heading,
    fallbackStack: SERIF_FALLBACK,
  },
] as const;

export const FONT_CATALOG_CODES: ReadonlySet<string> = new Set(
  FONT_CATALOG.map((f) => f.code),
);

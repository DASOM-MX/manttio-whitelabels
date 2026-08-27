import { cdnUrl, deleteObjects } from '../../storage/services/storage.service';
import { DEFAULT_BRAND } from '../constants/default-brand';
import { FONT_CATALOG } from '../constants/font-catalog';
import { findBrand, upsertBrand } from '../repository/brand.repository';
import { generateBrandIcons } from './brand-icons.service';
import type { Db } from '../../database/client';
import type { Brand, BrandColors, FontCatalogEntry, HslScale } from '../dtos/brand.dto';
import type { BrandRow } from '../types/brand.types';
import type { SaveBrandInput } from '../validators/brand.validator';

/** What the jsonb may actually hold during the 22 CP-1 rollout: a row written
 *  before the accent migration has no `accent` and still carries the retired
 *  `surface` key. */
type StoredBrandColors = { primary: HslScale; accent?: HslScale };

// The read contract is exactly the two brand scales (22 § Target 1), so colors
// are projected rather than passed through — the tombstoned `surface` key the
// migration deliberately leaves in storage never reaches a consumer. An accent
// that has not been seeded yet mirrors the migration's own rule (accent starts
// as primary), so a deploy landing ahead of the migration still serves a
// complete palette instead of a half-empty one.
const brandColors = (stored: StoredBrandColors): BrandColors => ({
  primary: stored.primary,
  accent: stored.accent ?? stored.primary,
});

// Read materialization (rule 6): R2 keys → finished CDN URLs, and only fields
// that actually carry a value make it into the payload — absent identity is
// omitted so consumers hide it instead of rendering placeholders (rule 5).
const materializeBrand = (row: BrandRow, cdnBase: string): Brand => {
  const result: Brand = { name: row.name, colors: brandColors(row.colors) };
  if (row.slogan) result.slogan = row.slogan;
  if (row.description) result.description = row.description;
  if (row.siteUrl) result.siteUrl = row.siteUrl;
  if (row.logoKey) result.logoUrl = cdnUrl(cdnBase, row.logoKey);
  if (row.logoDarkKey) result.logoDarkUrl = cdnUrl(cdnBase, row.logoDarkKey);
  if (row.isologoKey) result.isologoUrl = cdnUrl(cdnBase, row.isologoKey);
  if (row.faviconKey) result.faviconUrl = cdnUrl(cdnBase, row.faviconKey);
  if (row.icons) {
    result.icons = {
      any192: cdnUrl(cdnBase, row.icons.any192Key),
      any512: cdnUrl(cdnBase, row.icons.any512Key),
      maskable192: cdnUrl(cdnBase, row.icons.maskable192Key),
      maskable512: cdnUrl(cdnBase, row.icons.maskable512Key),
    };
  }
  if (row.contact) result.contact = row.contact;
  if (row.social) result.social = row.social;
  if (row.font) result.font = row.font;
  return result;
};

/** The stored brand, or the neutral default until the row exists (rule 3). */
export const getBrand = async (db: Db, cdnBase: string): Promise<Brand> => {
  const row = await findBrand(db);
  return row ? materializeBrand(row, cdnBase) : DEFAULT_BRAND;
};

export const saveBrand = async (
  db: Db,
  cdnBase: string,
  bucket: R2Bucket,
  input: SaveBrandInput,
): Promise<Brand> => {
  const existing = await findBrand(db);
  // The PWA icon set is regenerated from the mark on every save — the mark or
  // its bytes may have changed, and saves are rare admin writes. A failed
  // generation (missing object, non-PNG source) saves the brand without icons;
  // the manifest then serves its neutral bundled set (rule 5).
  const iconSourceKey = input.faviconKey ?? input.isologoKey ?? null;
  const icons = iconSourceKey ? await generateBrandIcons(bucket, iconSourceKey) : null;
  const row = await upsertBrand(db, {
    name: input.name,
    slogan: input.slogan,
    description: input.description ?? null,
    // siteUrl is manager-owned: the in-tenant editor never sends it, so an
    // absent value means "keep what the whitelabel package provisioned".
    siteUrl: input.siteUrl ?? existing?.siteUrl ?? null,
    logoKey: input.logoKey ?? null,
    logoDarkKey: input.logoDarkKey ?? null,
    isologoKey: input.isologoKey ?? null,
    faviconKey: input.faviconKey ?? null,
    colors: input.colors,
    icons,
    contact: input.contact ?? null,
    social: input.social ?? null,
    font: input.font ?? null,
  });
  if (existing?.icons) {
    // Best-effort cleanup of the superseded generated objects (the new set
    // always lands under fresh timestamped keys); orphans are harmless.
    try {
      await deleteObjects(bucket, Object.values(existing.icons));
    } catch {
      /* noop */
    }
  }
  return materializeBrand(row, cdnBase);
};

/** The curated catalog with `files.variable` materialized against the shared
 *  fonts CDN; until that CDN is configured, entries ship without files (the
 *  two defaults are bundled by every consumer, so they need none). */
export const getFontCatalog = (fontCdnBase?: string): FontCatalogEntry[] => {
  const base = fontCdnBase?.replace(/\/$/, '');
  return FONT_CATALOG.map((f) => ({
    code: f.code,
    label: f.label,
    group: f.group,
    roles: f.roles,
    files: base ? { variable: `${base}/${f.code}.woff2` } : {},
    fallbackStack: f.fallbackStack,
    ...(f.tnumVerified ? { tnumVerified: true } : {}),
    ...(f.recommendedHeading ? { recommendedHeading: f.recommendedHeading } : {}),
  }));
};

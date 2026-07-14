import type { brand } from '../models/brand.model';
import type { FontRole } from '../enums/brand.enum';

export type BrandRow = typeof brand.$inferSelect;
export type NewBrandRow = typeof brand.$inferInsert;

/** Catalog constant entry — the pre-materialization shape of a
 *  `FontCatalogEntry` (no URL; `files.variable` is built at serve time from
 *  `FONT_CDN_BASE_URL` + `<code>.woff2`). */
export type FontCatalogSeed = {
  code: string;
  label: string;
  group: string;
  roles: FontRole;
  fallbackStack: string;
  tnumVerified?: boolean;
  recommendedHeading?: string;
};

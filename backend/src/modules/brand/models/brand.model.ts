import { sql } from 'drizzle-orm';
import { check, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { BrandColors, BrandContact, BrandFont, BrandSocial } from '../dtos/brand.dto';

// Single-row tenant brand — one deployment per tenant (rule 8), so no
// tenant_id and a CHECK pinning id = 1. Writers (owner editor / manager push)
// send fully materialized HSL 0…1000 scales; they are stored verbatim — no
// server-side tinting. Image columns hold R2 keys, materialized to CDN URLs
// on read, never stored as URLs.
export const brand = pgTable(
  'brand',
  {
    id: integer('id').primaryKey().default(1),
    name: text('name').notNull(),
    slogan: text('slogan'),
    description: text('description'),
    siteUrl: text('site_url'),
    logoKey: text('logo_key'),
    logoDarkKey: text('logo_dark_key'),
    isologoKey: text('isologo_key'),
    faviconKey: text('favicon_key'),
    colors: jsonb('colors').$type<BrandColors>().notNull(),
    contact: jsonb('contact').$type<BrandContact>(),
    social: jsonb('social').$type<BrandSocial>(),
    font: jsonb('font').$type<BrandFont>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [check('brand_singleton_check', sql`${table.id} = 1`)],
);

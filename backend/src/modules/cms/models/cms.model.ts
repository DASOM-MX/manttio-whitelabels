import { sql } from 'drizzle-orm';
import { check, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// One row per section. `draft` holds the editors' working copy (home only —
// the clients draft lives in `cms_clients` rows); `published` is the snapshot
// the public routes serve. Publish copies draft → published (04 §5).
export const cmsDocuments = pgTable(
  'cms_documents',
  {
    section: text('section').primaryKey(),
    draft: jsonb('draft'),
    published: jsonb('published'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (table) => [
    check('cms_documents_section_check', sql`${table.section} in ('home', 'clients')`),
  ],
);

// Draft client entries (the `cms_clients` section). Hard delete: these are
// content rows, not audited user-facing resources — the published snapshot in
// `cms_documents` keeps serving deleted entries until the next publish.
export const cmsClients = pgTable('cms_clients', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  legal: text('legal'),
  sector: text('sector'),
  logoKey: text('logo_key'),
  // Constrained HTML — sanitized server-side on every write (04 §5 guardrail).
  businessRelationDescription: text('business_relation_description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

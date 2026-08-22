import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// WMS-local key-value settings store (user decision 2026-08-08 — scoped down
// from the plan's cross-cutting `modules/settings/` + Durable-Object cache,
// 00 §6 #12): new settings = new rows under a new key in
// `constants/wms-setting-keys.ts`, never new columns. Postgres is the source
// of truth; add a read cache only if reads ever get hot. NOTE: the plan's
// `notifications.manager_user_id` key was to share this store — it needs a
// home (likely the notifications module) before 07/11 build their
// pending-approval warnings.
//
// Accessors stay `getSetting`/`setSetting` (a wms service, 02's slice); an
// absent row must behave like its default (`WMS_SETTING_DEFAULTS`) —
// provisioning seeds nothing.
export const wmsSettings = pgTable('wms_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  // Namespaced `<domain>.<name>`, e.g. `wms.last_replenishment_mapping`.
  key: text('key').notNull().unique(),
  value: jsonb('value').notNull(),
  // When the key was first written; `updatedAt` moves on every set.
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

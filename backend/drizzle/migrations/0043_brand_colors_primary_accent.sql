-- 22 CP-1 — the tenant brand pair becomes primary + accent.
--
-- Data-only: `brand.colors` is a single-row jsonb, so the column itself does
-- not change shape. Seeds `accent` from the tenant's existing `primary` — a
-- deliberately value-neutral start (accent is live from minute one, visually
-- identical to primary, and the owner re-picks it in the brand editor).
-- Seeding from `surface` would put a gray in an accent role; seeding a literal
-- hue would invent a brand the tenant never chose (branding rule 3).
--
-- The legacy `surface` key is left in place, unread: non-destructive and
-- hand-reversible, the same tombstone reflex as plan 16's palette names. It
-- disappears on its own with the first save (the validator's z.object strips
-- unknown keys). No column is dropped, nothing is deleted.
UPDATE "brand"
SET "colors" = jsonb_set("colors", '{accent}', "colors" -> 'primary', true)
WHERE "id" = 1
  AND jsonb_exists("colors", 'primary')
  AND NOT jsonb_exists("colors", 'accent');

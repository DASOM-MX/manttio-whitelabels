-- Hand-written, scoped: one additive column on `equipment` (11 — up to 3 photos
-- of the unit, R2 CDN URLs). Not from `db:generate` (would bundle the DB's
-- out-of-band catch-up + drops). `IF NOT EXISTS` keeps it idempotent.
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "photos" text[] DEFAULT '{}'::text[] NOT NULL;

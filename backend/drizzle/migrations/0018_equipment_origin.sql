-- Hand-written, scoped: replace the `installed_by_us` boolean with an `origin`
-- enum (externo | venta | renta) on `equipment` (11). Additive add + backfill,
-- then drop the old column. Guarded so it's safe to re-run.
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "origin" text DEFAULT 'externo' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 IF EXISTS (
   SELECT 1 FROM information_schema.columns
   WHERE table_name = 'equipment' AND column_name = 'installed_by_us'
 ) THEN
   UPDATE "equipment" SET "origin" = CASE WHEN "installed_by_us" THEN 'venta' ELSE 'externo' END;
 END IF;
END $$;--> statement-breakpoint
ALTER TABLE "equipment" DROP COLUMN IF EXISTS "installed_by_us";

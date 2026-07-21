-- Mexican two-surname convention on users (owner ask, 2026-07-21): the
-- superadmin form asks for both; nullable because pre-existing rows predate
-- the split (their full name lives in `name`). Guarded so it's safe to re-run.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "paternal_last_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "maternal_last_name" text;

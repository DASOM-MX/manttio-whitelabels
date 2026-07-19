-- `status` and `source` already exist on the live shared Neon DB (added
-- out-of-band; modeled in PR #73) — this migration adds only what's missing:
-- client_type, status_changed_at, the attribution columns, and their
-- indexes/checks. ADD COLUMN uses IF NOT EXISTS as defense against further
-- out-of-band drift; the source check covers the full CustomerSource enum,
-- which is a superset of every value the superadmin picker writes.
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "client_type" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "utm_source" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "utm_medium" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "utm_campaign" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "utm_term" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "utm_content" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "gclid" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "fbclid" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "referrer" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "landing_page" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_utm_source_idx" ON "customers" USING btree ("utm_source") WHERE "customers"."utm_source" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_utm_campaign_idx" ON "customers" USING btree ("utm_campaign") WHERE "customers"."utm_campaign" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_status_idx" ON "customers" USING btree ("status") WHERE "customers"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_source_idx" ON "customers" USING btree ("source") WHERE "customers"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_client_type_idx" ON "customers" USING btree ("client_type") WHERE "customers"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_status_check" CHECK ("customers"."status" in ('active', 'lead', 'disabled', 'blacklisted'));--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_source_check" CHECK ("customers"."source" in ('facebook', 'google', 'referral', 'website', 'phonecall', 'personal_meeting', 'other', 'instagram', 'tiktok', 'whatsapp'));--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_client_type_check" CHECK ("customers"."client_type" in ('person', 'business'));

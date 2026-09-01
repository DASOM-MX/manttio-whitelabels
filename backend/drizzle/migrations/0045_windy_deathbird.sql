DROP INDEX IF EXISTS "customer_contacts_one_default_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "customer_contacts_email_uidx";--> statement-breakpoint
ALTER TABLE "customer_contacts" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customer_contacts_one_default_idx" ON "customer_contacts" USING btree ("customer_id") WHERE "customer_contacts"."is_default" and "customer_contacts"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customer_contacts_email_uidx" ON "customer_contacts" USING btree ("email") WHERE "customer_contacts"."deleted_at" is null;
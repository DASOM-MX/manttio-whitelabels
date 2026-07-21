-- Scoped to the notifications module (notifications plan §1, CP-1). Everything
-- else db:generate bundled into this file (customer_contacts, customer_fiscal,
-- customer_interactions, equipment, the customers CRM/UTM columns) already
-- exists on the live shared Neon DB — added out-of-band or in prior PRs, the
-- journal is just behind. This file is the record of the notifications DDL
-- only; guards make it safe to re-run. The email channel is deferred (owner,
-- 2026-07-20): its email_status/email_error columns land as additive DDL when
-- that channel is wired.
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"audience_role" text,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'unread' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_type_check" CHECK ("notifications"."type" in ('replenishment_ready', 'replenishment_failed', 'replenishment_rejected')),
	CONSTRAINT "notifications_status_check" CHECK ("notifications"."status" in ('unread', 'read')),
	CONSTRAINT "notifications_audience_role_check" CHECK ("notifications"."audience_role" in ('owner', 'admin', 'office', 'technician'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_recipient_created_idx" ON "notifications" USING btree ("recipient_user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_recipient_unread_idx" ON "notifications" USING btree ("recipient_user_id") WHERE "notifications"."status" = 'unread';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_created_idx" ON "notifications" USING btree ("created_at");

CREATE TABLE IF NOT EXISTS "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"identification" text,
	"phone" text,
	"email" text,
	"observation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_counters" (
	"day" date PRIMARY KEY NOT NULL,
	"last_number" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_details" (
	"report_id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"pictures" text[] DEFAULT '{}'::text[] NOT NULL,
	"signature" text,
	"content_filled_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" text NOT NULL,
	"sent_by" uuid NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recipient_to" text NOT NULL,
	"recipient_cc" text[] DEFAULT '{}'::text[] NOT NULL,
	"access_token" text NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"resend_message_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"report_type" text NOT NULL,
	"work_type" text,
	"date_arrival" timestamp with time zone,
	"date_departure" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"assigned_to" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"signed_by" text,
	"status" text DEFAULT 'created' NOT NULL,
	"signed_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"mailed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_status_check" CHECK ("reports"."status" in ('created', 'in-progress', 'finished', 'mailed'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('admin', 'technician'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_details" ADD CONSTRAINT "report_details_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_emails" ADD CONSTRAINT "report_emails_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_emails" ADD CONSTRAINT "report_emails_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reports" ADD CONSTRAINT "reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reports" ADD CONSTRAINT "reports_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reports" ADD CONSTRAINT "reports_client_id_customers_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_email_idx" ON "customers" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "report_emails_token_idx" ON "report_emails" USING btree ("access_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_emails_report_id_idx" ON "report_emails" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_created_by_idx" ON "reports" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_assigned_to_idx" ON "reports" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_client_id_idx" ON "reports" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_report_type_idx" ON "reports" USING btree ("report_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_status_idx" ON "reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_assigned_status_idx" ON "reports" USING btree ("assigned_to","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_active_idx" ON "users" USING btree ("email") WHERE "users"."deleted_at" is null;
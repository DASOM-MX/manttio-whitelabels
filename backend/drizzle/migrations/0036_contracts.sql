-- Scoped to the contracts module (13 §1, owner supersession 2026-07-22: plain
-- document CRUD). Guards make it safe to re-run.
CREATE TABLE IF NOT EXISTS "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid,
	"description" text NOT NULL,
	"file_url" text NOT NULL,
	"file_name" text NOT NULL,
	"file_mime" text NOT NULL,
	"file_size" integer,
	"validation_date" date NOT NULL,
	"expiry_date" date,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"delete_comment" text,
	"deleted_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contracts" ADD CONSTRAINT "contracts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contracts" ADD CONSTRAINT "contracts_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contracts_customer_idx" ON "contracts" USING btree ("customer_id") WHERE "contracts"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contracts_tags_gin_idx" ON "contracts" USING gin ("tags");
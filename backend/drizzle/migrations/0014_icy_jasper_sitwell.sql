CREATE TABLE IF NOT EXISTS "customer_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"phone" text,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_fiscal" (
	"customer_id" uuid PRIMARY KEY NOT NULL,
	"rfc" text NOT NULL,
	"legal_name" text NOT NULL,
	"tax_regime_code" text NOT NULL,
	"fiscal_zip" text NOT NULL,
	"cfdi_use_code" text NOT NULL,
	"billing_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "contact_name" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "source" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "blacklist_reason" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "next_follow_up_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "delete_comment" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_fiscal" ADD CONSTRAINT "customer_fiscal_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_contacts_customer_idx" ON "customer_contacts" USING btree ("customer_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customers" ADD CONSTRAINT "customers_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_status_idx" ON "customers" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_source_idx" ON "customers" USING btree ("source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_tags_idx" ON "customers" USING gin ("tags");
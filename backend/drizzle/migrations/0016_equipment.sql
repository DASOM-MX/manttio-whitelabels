-- Hand-written, scoped to the two NEW equipment tables only (11-equipment.md).
-- NOT produced by `db:generate`: the shared Neon DB is ahead of the migration
-- files (customer_contacts/customer_fiscal/customer_interactions and the CRM
-- customers columns were applied out-of-band and are absent from the 0015
-- snapshot), so a generated diff would bundle those as a catch-up and collide
-- on apply. This file adds only equipment + equipment_reports; no meta snapshot
-- is emitted for the same reason (the snapshot chain is already out of sync;
-- `db:generate` stays off-limits on this DB — additive SQL only).
CREATE TABLE IF NOT EXISTS "equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text,
	"brand" text,
	"model" text,
	"serial_number" text,
	"kind" text,
	"capacity" text,
	"location" text,
	"install_date" date,
	"installed_by_us" boolean DEFAULT false NOT NULL,
	"material_unit_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"delete_comment" text,
	"deleted_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "equipment_reports" (
	"equipment_id" uuid NOT NULL,
	"report_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_reports_equipment_id_report_id_pk" PRIMARY KEY("equipment_id","report_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "equipment" ADD CONSTRAINT "equipment_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "equipment" ADD CONSTRAINT "equipment_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "equipment_reports" ADD CONSTRAINT "equipment_reports_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "equipment_reports" ADD CONSTRAINT "equipment_reports_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "equipment_customer_idx" ON "equipment" USING btree ("customer_id") WHERE "equipment"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "equipment_serial_idx" ON "equipment" USING btree ("serial_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "equipment_reports_report_idx" ON "equipment_reports" USING btree ("report_id");

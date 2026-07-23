-- Scoped to the visits module (12-calendar CP-1): scheduled_visits + the
-- append-only visit_events audit trail (every mutation: created / updated /
-- assigned / status_changed / rescheduled). Hand-written additive DDL — the
-- shared Neon DB is ahead of the drizzle journal, so db:generate stays
-- off-limits here; guards make this file safe to re-run.
CREATE TABLE IF NOT EXISTS "scheduled_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"technician_id" uuid,
	"scheduled_start" timestamp with time zone NOT NULL,
	"scheduled_end" timestamp with time zone,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"status_reason" text,
	"rescheduled_from_id" uuid,
	"report_id" text,
	"title" text,
	"notes" text,
	"created_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_visits_status_check" CHECK ("scheduled_visits"."status" in ('scheduled', 'completed', 'cancelled', 'missed', 'rescheduled'))
);
--> statement-breakpoint
-- Reschedule columns (12 §1, 2026-07-23) — additive for an already-created table.
ALTER TABLE "scheduled_visits" ADD COLUMN IF NOT EXISTS "status_reason" text;--> statement-breakpoint
ALTER TABLE "scheduled_visits" ADD COLUMN IF NOT EXISTS "rescheduled_from_id" uuid;--> statement-breakpoint
-- Widen the status CHECK to admit 'rescheduled' (drop + re-add is idempotent).
ALTER TABLE "scheduled_visits" DROP CONSTRAINT IF EXISTS "scheduled_visits_status_check";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheduled_visits" ADD CONSTRAINT "scheduled_visits_status_check" CHECK ("scheduled_visits"."status" in ('scheduled', 'completed', 'cancelled', 'missed', 'rescheduled'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Transitional (2026-07-23): an earlier apply of this branch created the
-- assignment-only "visit_assignments"; it is superseded by the general
-- "visit_events" audit log below. Drop it only when empty — it is append-only
-- and unreleased, so an empty table carries no audit data (honors the
-- no-destructive-migrations rule, which guards entity data, not scaffolding).
DO $$ BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'visit_assignments') THEN
		IF NOT EXISTS (SELECT 1 FROM "visit_assignments" LIMIT 1) THEN
			DROP TABLE "visit_assignments";
		END IF;
	END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "visit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visit_id" uuid NOT NULL,
	"type" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"from_technician_id" uuid,
	"to_technician_id" uuid,
	"changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visit_events_type_check" CHECK ("visit_events"."type" in ('created', 'updated', 'assigned', 'status_changed', 'rescheduled'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheduled_visits" ADD CONSTRAINT "scheduled_visits_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheduled_visits" ADD CONSTRAINT "scheduled_visits_technician_id_users_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheduled_visits" ADD CONSTRAINT "scheduled_visits_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheduled_visits" ADD CONSTRAINT "scheduled_visits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheduled_visits" ADD CONSTRAINT "scheduled_visits_rescheduled_from_id_scheduled_visits_id_fk" FOREIGN KEY ("rescheduled_from_id") REFERENCES "public"."scheduled_visits"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visit_events" ADD CONSTRAINT "visit_events_visit_id_scheduled_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."scheduled_visits"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visit_events" ADD CONSTRAINT "visit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visit_events" ADD CONSTRAINT "visit_events_from_technician_id_users_id_fk" FOREIGN KEY ("from_technician_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visit_events" ADD CONSTRAINT "visit_events_to_technician_id_users_id_fk" FOREIGN KEY ("to_technician_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_visits_start_idx" ON "scheduled_visits" USING btree ("scheduled_start") WHERE "scheduled_visits"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_visits_technician_idx" ON "scheduled_visits" USING btree ("technician_id","scheduled_start") WHERE "scheduled_visits"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_visits_customer_idx" ON "scheduled_visits" USING btree ("customer_id","scheduled_start") WHERE "scheduled_visits"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_visits_rescheduled_from_idx" ON "scheduled_visits" USING btree ("rescheduled_from_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visit_events_visit_idx" ON "visit_events" USING btree ("visit_id","created_at");

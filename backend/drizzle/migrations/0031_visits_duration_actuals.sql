-- 12 CP-1 + CP-1b — scheduled visits, and the plan-vs-actual time tracking.
--
-- This migration does double duty, deliberately:
--
--  1. It **backfills the CP-1 tables**. `scheduled_visits` and `visit_equipment`
--     were applied straight to the shared Neon DB when the visits module was
--     built, so no migration ever created them. On a fresh database the CREATEs
--     below are what brings the tables into existence.
--  2. It adds the **CP-1b duration/actuals columns** (owner 2026-07-31).
--
-- Both sets of columns appear twice on purpose: inside the CREATE for a fresh
-- database, and again as guarded `ADD COLUMN`s, because `CREATE TABLE IF NOT
-- EXISTS` does nothing at all when the table is already there.
--
-- **Why every CP-1 column also needs an ALTER.** The shared database's
-- `scheduled_visits` is NOT the CP-1 table. It is the **pre-pivot** shape from
-- the abandoned PR #97 (`visit_assignments` + a `status_reason` column, no order
-- link), and the CP-1 DDL was never actually applied to it despite the model
-- claiming otherwise. It is missing nine columns, so a migration that only
-- ALTERed in the CP-1b four would fail on the very next statement — the
-- `service_order_id` foreign key has no column to attach to.
--
-- **Reconciled additively, not by replacement.** `status_reason` and the orphan
-- `visit_assignments` table are left exactly where they are. Both are empty, and
-- dropping them would be easy — but a `DROP` here runs against every future
-- tenant database, and "it was empty when I checked" is not a good enough reason
-- to put one in a file that provisions customers. Additive reconciliation also
-- needs no exception to the no-destructive-migrations rule (`backend/CLAUDE.md`).
--
-- Every statement is idempotent, so re-running against a database in any of
-- those states is safe.

CREATE TABLE IF NOT EXISTS "scheduled_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"internal_code" text NOT NULL,
	"service_order_id" uuid,
	"customer_id" uuid NOT NULL,
	"technician_id" uuid,
	"scheduled_start" timestamp with time zone NOT NULL,
	"scheduled_end" timestamp with time zone,
	"expected_duration_minutes" integer DEFAULT 60 NOT NULL,
	"actual_start" timestamp with time zone,
	"actual_end" timestamp with time zone,
	"actual_duration_minutes" integer,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"close_reason" text,
	"close_note" text,
	"rescheduled_from_id" uuid,
	"report_id" text,
	"title" text,
	"notes" text,
	"created_by" uuid NOT NULL,
	"delete_comment" text,
	"deleted_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "visit_equipment" (
	"visit_id" uuid NOT NULL,
	"equipment_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visit_equipment_visit_id_equipment_id_pk" PRIMARY KEY("visit_id","equipment_id")
);
--> statement-breakpoint
-- Daily sequence behind `scheduled_visits.internal_code`, same mechanics as
-- `service_order_counters` / `report_counters`. Not an entity: no soft-delete
-- columns, nothing ever removes a row.
CREATE TABLE IF NOT EXISTS "visit_counters" (
	"day" date PRIMARY KEY NOT NULL,
	"last_number" integer NOT NULL
);
--> statement-breakpoint
-- Every column, for a database that already had *a* `scheduled_visits` table.
-- The CP-1 five come first: on the shared database they are genuinely missing
-- (pre-pivot shape), and `service_order_id` in particular must exist before the
-- foreign keys below can reference it.
ALTER TABLE "scheduled_visits" ADD COLUMN IF NOT EXISTS "service_order_id" uuid;--> statement-breakpoint
ALTER TABLE "scheduled_visits" ADD COLUMN IF NOT EXISTS "close_reason" text;--> statement-breakpoint
ALTER TABLE "scheduled_visits" ADD COLUMN IF NOT EXISTS "close_note" text;--> statement-breakpoint
ALTER TABLE "scheduled_visits" ADD COLUMN IF NOT EXISTS "delete_comment" text;--> statement-breakpoint
ALTER TABLE "scheduled_visits" ADD COLUMN IF NOT EXISTS "deleted_by" uuid;--> statement-breakpoint
-- Then the CP-1b four. `expected_duration_minutes` is NOT NULL with a default,
-- which Postgres backfills without a table rewrite (11+) — and the shared table
-- is empty in any case.
ALTER TABLE "scheduled_visits" ADD COLUMN IF NOT EXISTS "expected_duration_minutes" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduled_visits" ADD COLUMN IF NOT EXISTS "actual_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scheduled_visits" ADD COLUMN IF NOT EXISTS "actual_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scheduled_visits" ADD COLUMN IF NOT EXISTS "actual_duration_minutes" integer;--> statement-breakpoint
-- `internal_code` (owner 2026-08-02) in three steps rather than one, because it
-- is NOT NULL with no default and an existing table may already hold rows.
-- Adding it NOT NULL outright would fail there; adding a default would hand
-- every old row the same code and break the unique index. So: add nullable,
-- mint codes for whatever is already there, then enforce.
--
-- On the shared database this is a no-op with real work behind it — the table
-- is empty, so the UPDATE touches nothing and the SET NOT NULL is instant.
ALTER TABLE "scheduled_visits" ADD COLUMN IF NOT EXISTS "internal_code" text;--> statement-breakpoint
-- Backfill: `V-YYYYMMDD-NNNN` per creation day, numbered by age within the day
-- so the codes read in the order the visits were booked.
UPDATE "scheduled_visits" AS v
SET "internal_code" = c.code
FROM (
	SELECT
		"id",
		'V-' || to_char("created_at", 'YYYYMMDD') || '-'
			|| lpad(
				row_number() OVER (
					PARTITION BY date_trunc('day', "created_at") ORDER BY "created_at", "id"
				)::text,
				4, '0'
			) AS code
	FROM "scheduled_visits"
	WHERE "internal_code" IS NULL
) AS c
WHERE v."id" = c."id";--> statement-breakpoint
-- Seed the counter from what the backfill used, so the first freshly minted
-- code continues the sequence instead of colliding with a backfilled one.
INSERT INTO "visit_counters" ("day", "last_number")
SELECT date_trunc('day', "created_at")::date, count(*)
FROM "scheduled_visits"
GROUP BY 1
ON CONFLICT ("day") DO NOTHING;--> statement-breakpoint
ALTER TABLE "scheduled_visits" ALTER COLUMN "internal_code" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheduled_visits" ADD CONSTRAINT "scheduled_visits_service_order_id_service_orders_id_fk" FOREIGN KEY ("service_order_id") REFERENCES "public"."service_orders"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
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
 ALTER TABLE "scheduled_visits" ADD CONSTRAINT "scheduled_visits_rescheduled_from_id_scheduled_visits_id_fk" FOREIGN KEY ("rescheduled_from_id") REFERENCES "public"."scheduled_visits"("id") ON DELETE restrict ON UPDATE no action;
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
 ALTER TABLE "scheduled_visits" ADD CONSTRAINT "scheduled_visits_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visit_equipment" ADD CONSTRAINT "visit_equipment_visit_id_scheduled_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."scheduled_visits"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visit_equipment" ADD CONSTRAINT "visit_equipment_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- On the shared database the first three already exist with these exact names
-- and predicates, so they skip. `scheduled_visits_order_idx` and the unique
-- `..._rescheduled_from_uidx` are new there.
--
-- The pre-pivot table also carries a **non-unique** `scheduled_visits_
-- rescheduled_from_idx`. It is left in place (no destructive migrations); the
-- uniqueness the reschedule chain depends on comes from the `_uidx` below, which
-- is a different index under a different name.
-- Codes are looked up by equality or prefix (`V-2026`, a full code), which is
-- what a btree serves; a `%fragment%` search was deliberately not chosen, since
-- it would have meant `pg_trgm` in every tenant database. Unique on live rows
-- only — a tombstoned visit's code is history, not a name still in use.
CREATE UNIQUE INDEX IF NOT EXISTS "scheduled_visits_internal_code_uidx" ON "scheduled_visits" USING btree ("internal_code") WHERE "scheduled_visits"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_visits_start_idx" ON "scheduled_visits" USING btree ("scheduled_start") WHERE "scheduled_visits"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_visits_technician_idx" ON "scheduled_visits" USING btree ("technician_id","scheduled_start") WHERE "scheduled_visits"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_visits_customer_idx" ON "scheduled_visits" USING btree ("customer_id","scheduled_start") WHERE "scheduled_visits"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_visits_order_idx" ON "scheduled_visits" USING btree ("service_order_id") WHERE "scheduled_visits"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "scheduled_visits_rescheduled_from_uidx" ON "scheduled_visits" USING btree ("rescheduled_from_id") WHERE "scheduled_visits"."rescheduled_from_id" is not null and "scheduled_visits"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visit_equipment_equipment_idx" ON "visit_equipment" USING btree ("equipment_id");

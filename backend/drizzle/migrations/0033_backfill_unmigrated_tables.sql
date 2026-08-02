-- Backfill: four tables the code depends on that NO migration ever created.
--
-- They exist on the current shared database only because they were applied by
-- hand. That is invisible day to day — and fatal the first time a **new client
-- instance** is provisioned, because a tenant database is built by running
-- these migrations, so it would come out missing the entire CRM contact /
-- fiscal / timeline set and the catalog audit trail.
--
-- This file is therefore a no-op against the existing database and load-bearing
-- against every future one. Every statement is guarded, so it is safe to re-run
-- anywhere.
--
-- Two other tables had the same problem and are fixed in their own PRs:
-- `scheduled_visits` + `visit_equipment` (0031, visits) and `contracts` (0032).
--
-- NOTE ON `ON DELETE`: these clauses mirror the **Drizzle models**, which is
-- what a `db:generate` would have emitted had these tables ever gone through
-- one — `no action` for the customer links, `restrict` where `service_events`
-- declares it. That is the whole point: this file has to produce the schema the
-- code was written against.
--
-- The existing shared database happens to carry **CASCADE** on
-- `customer_contacts` / `customer_fiscal`, added out-of-band years before this
-- file. The column guards below leave it exactly as it is, so nothing changes
-- there. It is unreachable either way — customers are only ever soft-deleted,
-- so the cascade can only fire when a developer clears rows by hand in dev.

CREATE TABLE IF NOT EXISTS "customer_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"phone" text,
	"email" text,
	"is_default" boolean DEFAULT false NOT NULL,
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
CREATE TABLE IF NOT EXISTS "customer_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"type" text NOT NULL,
	"body" text NOT NULL,
	"ref_kind" text,
	"ref_id" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"service_id" uuid NOT NULL,
	"type" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"changes" jsonb,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- The FK guards deliberately test for **any** foreign key on the column, not
-- for a constraint of this name. The existing database created these tables
-- out-of-band, so its constraints carry Postgres' default `*_fkey` names rather
-- than drizzle's `*_table_id_fk` ones — a name-based `duplicate_object` guard
-- would not fire there and would happily add a second, redundant foreign key on
-- the same column. Guarding on the column is idempotent regardless of what the
-- existing constraint happens to be called.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints tc
   JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
   WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_name='customer_contacts' AND kcu.column_name='customer_id') THEN
  ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints tc
   JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
   WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_name='customer_fiscal' AND kcu.column_name='customer_id') THEN
  ALTER TABLE "customer_fiscal" ADD CONSTRAINT "customer_fiscal_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints tc
   JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
   WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_name='customer_interactions' AND kcu.column_name='customer_id') THEN
  ALTER TABLE "customer_interactions" ADD CONSTRAINT "customer_interactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints tc
   JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
   WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_name='customer_interactions' AND kcu.column_name='user_id') THEN
  ALTER TABLE "customer_interactions" ADD CONSTRAINT "customer_interactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints tc
   JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
   WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_name='service_events' AND kcu.column_name='service_id') THEN
  ALTER TABLE "service_events" ADD CONSTRAINT "service_events_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints tc
   JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
   WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_name='service_events' AND kcu.column_name='actor_id') THEN
  ALTER TABLE "service_events" ADD CONSTRAINT "service_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_contacts_customer_idx" ON "customer_contacts" USING btree ("customer_id");--> statement-breakpoint
-- At most one default contact per customer — the partial index IS the rule.
CREATE UNIQUE INDEX IF NOT EXISTS "customer_contacts_one_default_idx" ON "customer_contacts" USING btree ("customer_id") WHERE "is_default";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_interactions_customer_idx" ON "customer_interactions" USING btree ("customer_id","created_at");--> statement-breakpoint
-- Ordered by `seq`, never `created_at`: a batch of events shares one now(), so
-- timestamp ordering leaves ties the planner may return in any order.
CREATE INDEX IF NOT EXISTS "service_events_service_idx" ON "service_events" USING btree ("service_id","seq");

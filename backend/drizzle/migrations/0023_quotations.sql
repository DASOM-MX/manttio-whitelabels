-- Quotations module (20 §1, CP-1). Hand-written additive DDL, applied directly
-- to the shared Neon DB (ahead-of-migrations rule) — every statement is
-- guarded, so re-running this file is a no-op.
--
-- Enum-ish columns (status, response, uom, tax_rate, ref_kind, type) carry NO
-- CHECK constraints, matching the `services` posture (18) rather than
-- `notifications` (0020): the Drizzle model is the single source of truth, and
-- `status` in particular is rewritten by the reviewer tally often enough that a
-- constraint would be one more place to keep in sync for no added safety —
-- nothing writes these columns except this module's own validated services.
--
-- Every FK is ON DELETE RESTRICT. Nothing cascades anywhere in this codebase
-- (no-hard-delete rule), and a quotation is a commercial record that must
-- outlive tidy-ups of the rows it points at.

-- Per-day folio sequence ('COT-YYYYMMDD-NNNN'), mirroring report_counters.
CREATE TABLE IF NOT EXISTS "quotation_counters" (
	"day" date PRIMARY KEY NOT NULL,
	"last_number" integer NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "quotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folio" text NOT NULL,
	"customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT,
	"status" text DEFAULT 'draft' NOT NULL,
	"valid_until" date NOT NULL,
	"comments" text,
	-- Self-referential revision chain: this quote replaces a prior one.
	"supersedes_quotation_id" uuid REFERENCES "quotations"("id") ON DELETE RESTRICT,
	"sent_at" timestamp with time zone,
	-- The mandatory "why" behind either terminal staff action.
	"resolution_reason" text,
	"cancelled_at" timestamp with time zone,
	"order_created_at" timestamp with time zone,
	"resolved_by_user_id" uuid REFERENCES "users"("id") ON DELETE RESTRICT,
	-- The convergence (20 §6). Deliberately WITHOUT a foreign key: service_orders
	-- does not exist yet, and 19's DDL adds the constraint in the same change
	-- that first writes this column.
	"service_order_id" uuid,
	"created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint

-- Live folios only — a tombstoned quote releases its folio rather than
-- blocking the counter forever.
CREATE UNIQUE INDEX IF NOT EXISTS "quotations_folio_uidx"
	ON "quotations" ("folio") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quotations_customer_idx"
	ON "quotations" ("customer_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quotations_status_idx" ON "quotations" ("status");
--> statement-breakpoint

-- Frozen catalog snapshots (20 §1). service_id is traceability only — the line
-- never re-reads it, so repricing or soft-deleting a service leaves every
-- existing quote rendering what the client was actually quoted.
CREATE TABLE IF NOT EXISTS "quotation_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL REFERENCES "quotations"("id") ON DELETE RESTRICT,
	"service_id" uuid NOT NULL REFERENCES "services"("id") ON DELETE RESTRICT,
	"service_name" text NOT NULL,
	"description" text,
	"unit_price" numeric(12, 2) NOT NULL,
	"uom" text NOT NULL,
	"tax_rate" text NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quotation_lines_quotation_idx"
	ON "quotation_lines" ("quotation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quotation_lines_service_idx"
	ON "quotation_lines" ("service_id");
--> statement-breakpoint

-- One row per mailed contact — the per-recipient token model (20 §4).
CREATE TABLE IF NOT EXISTS "quotation_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL REFERENCES "quotations"("id") ON DELETE RESTRICT,
	"contact_id" uuid NOT NULL REFERENCES "customer_contacts"("id") ON DELETE RESTRICT,
	"email" text NOT NULL,
	"is_reviewer" boolean DEFAULT false NOT NULL,
	"token" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"viewed_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"response" text,
	"response_reason" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quotation_recipients_token_uidx"
	ON "quotation_recipients" ("token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quotation_recipients_quotation_idx"
	ON "quotation_recipients" ("quotation_id");
--> statement-breakpoint
-- One row per contact per quote. This index is also the ON CONFLICT target for
-- the re-send upsert: a second send updates the existing row (keeping its
-- token, so a link already in someone's inbox stays valid) instead of stacking
-- duplicate recipients.
CREATE UNIQUE INDEX IF NOT EXISTS "quotation_recipients_contact_uidx"
	ON "quotation_recipients" ("quotation_id", "contact_id");
--> statement-breakpoint

-- Append-only timeline (20 §5). No UPDATE or DELETE path exists in the module:
-- a reviewer who approves, flips to declined, then flips back leaves three
-- rows, and that sequence is the evidence a dispute needs.
CREATE TABLE IF NOT EXISTS "quotation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL REFERENCES "quotations"("id") ON DELETE RESTRICT,
	"type" text NOT NULL,
	-- Staff actions carry actor_id; token-page actions carry contact_id with
	-- actor_id null. Never both — "who did this" has exactly one answer.
	"actor_id" uuid REFERENCES "users"("id") ON DELETE RESTRICT,
	"contact_id" uuid REFERENCES "customer_contacts"("id") ON DELETE RESTRICT,
	"ref_kind" text,
	"ref_id" uuid,
	"changes" jsonb,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quotation_events_quotation_idx"
	ON "quotation_events" ("quotation_id", "created_at");

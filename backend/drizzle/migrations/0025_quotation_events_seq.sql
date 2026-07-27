-- Deterministic timeline order (20 §5, CP-1 review 2026-07-27).
--
-- Events are written in BATCHES — a quote opens with one `quotation_created`
-- plus one `quotation_line_added` per line, all in a single multi-row INSERT so
-- a 20-line quote costs one round trip instead of 21. Every row in such a batch
-- gets the same `now()`, so `ORDER BY created_at` leaves them tied and the
-- planner is free to return them in any order. A trail that reports
-- "line added" before "quotation created" is not evidence of anything.
--
-- `seq` is the insertion order and is now the ONLY thing the timeline sorts by;
-- `created_at` stays as the human-facing timestamp. Backfills existing rows
-- automatically (bigserial assigns values on ADD COLUMN, in physical order,
-- which for a table this young is insertion order).
ALTER TABLE "quotation_events" ADD COLUMN IF NOT EXISTS "seq" bigserial NOT NULL;--> statement-breakpoint

-- Re-point the covering index: reads are "this quote, in insertion order".
DROP INDEX IF EXISTS "quotation_events_quotation_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quotation_events_quotation_idx"
	ON "quotation_events" ("quotation_id", "seq");

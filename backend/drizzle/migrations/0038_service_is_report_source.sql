-- 19 follow-up (owner 2026-07-31): does a unit of this service produce a report
-- skeleton of its own? Two statements, and the order is the point:
--
-- The ADD lands with DEFAULT true so the one-time backfill gives every service
-- that predates the column today's behavior — before this flag existed every
-- line exploded — and no existing order changes meaning.
--
-- The default then flips to false (owner 2026-08-18): a service is only
-- something the order charges for unless the tenant says it is a job, so every
-- service created from here on is opt-in. The rows just backfilled keep true.
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "is_report_source" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "services" ALTER COLUMN "is_report_source" SET DEFAULT false;

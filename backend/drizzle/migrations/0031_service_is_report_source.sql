-- 19 follow-up (owner 2026-07-31): does a unit of this service produce a report
-- skeleton of its own? DEFAULT true backfills every existing row to today's
-- behavior (every line exploded), so no order changes meaning.
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "is_report_source" boolean DEFAULT true NOT NULL;

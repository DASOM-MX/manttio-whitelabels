ALTER TABLE "reports" ADD COLUMN "state" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_state_idx" ON "reports" USING btree ("state");
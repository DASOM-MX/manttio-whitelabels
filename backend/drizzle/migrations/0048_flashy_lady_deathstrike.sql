ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "service_request_id" uuid;--> statement-breakpoint
-- Hand-written: the Drizzle side stays undeclared (no `.references()` on the
-- column) so quotations.model.ts and service-requests.model.ts don't import
-- each other (models stay acyclic). `service_requests.quotation_id` already
-- declares its FK to quotations in Drizzle (01 §4, the backtrack) — this is
-- the reverse link, the full one-to-many set (01 §6b). `service_requests`
-- already exists by the time this runs, so the constraint is addable in order.
DO $$ BEGIN
 ALTER TABLE "quotations" ADD CONSTRAINT "quotations_service_request_id_service_requests_id_fk" FOREIGN KEY ("service_request_id") REFERENCES "public"."service_requests"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quotations_service_request_idx" ON "quotations" USING btree ("service_request_id");

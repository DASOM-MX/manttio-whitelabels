-- Widen the notifications type CHECK (client-portal 01 CP-4, 06 §5). Adds the
-- three service-request member (submitted/answered/closed); emitting call
-- sites land later in 06 CP-5/CP-6. Same drop-and-recreate-the-constraint
-- shape as 0021's widening, guarded so it's safe to re-run.
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("notifications"."type" in ('replenishment_ready', 'replenishment_failed', 'replenishment_rejected', 'announcement', 'report_created', 'report_finalized', 'client_registered_from_website', 'client_registered_from_superadmin', 'client_blacklisted', 'client_updated', 'client_archived', 'client_interaction_registered', 'service_request_submitted', 'service_request_answered', 'service_request_closed'));
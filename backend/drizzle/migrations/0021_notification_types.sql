-- Widen the notifications type CHECK (plan §1 — the enum is open by design;
-- extending it means extending this CHECK). Adds `announcement` (the
-- owner-authored explicit send, POST /notifications — plan §0 2026-07-20)
-- plus the core-product event types (report/client lifecycle, 2026-07-20),
-- whose emitting call sites land later in their own modules. Constraint swap
-- is the standard shape for a CHECK-narrowed enum; guarded so it's safe to
-- re-run.
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_type_check";--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type_check" CHECK ("notifications"."type" in ('replenishment_ready', 'replenishment_failed', 'replenishment_rejected', 'announcement', 'report_created', 'report_finalized', 'client_registered_from_website', 'client_registered_from_superadmin', 'client_blacklisted', 'client_updated', 'client_archived', 'client_interaction_registered'));

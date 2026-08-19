-- Audited soft delete on quotations (20 CP-1 review, owner 2026-07-27): the
-- module had a `deleted_at` column and every read already filtered on it, but
-- no route and no audit fields. `DELETE /quotations/:id` now takes a mandatory
-- `{ deleteComment }` and stamps who removed it — the same shape as
-- users/services/equipment, because a quotation is a commercial record and
-- taking it out of view has to say who and why.
--
-- Distinct from `cancelled`: cancelling retires a live quote the client may
-- still be shown; deleting is housekeeping that also stops every recipient
-- link resolving. Nothing is ever hard-deleted — the row and its whole
-- append-only timeline stay.
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "delete_comment" text;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "deleted_by" uuid;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "quotations" ADD CONSTRAINT "quotations_deleted_by_users_id_fk"
		FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE RESTRICT;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "service_requests" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "service_requests" ADD COLUMN IF NOT EXISTS "deleted_by_portal_user_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_deleted_by_portal_user_id_portal_users_id_fk" FOREIGN KEY ("deleted_by_portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "storage_nodes" ADD COLUMN IF NOT EXISTS "description" text;--> statement-breakpoint
ALTER TABLE "storage_nodes" ADD COLUMN IF NOT EXISTS "location_reference" text;--> statement-breakpoint
ALTER TABLE "storage_nodes" ADD COLUMN IF NOT EXISTS "assigned_user_id" uuid;--> statement-breakpoint
ALTER TABLE "storage_nodes" ADD COLUMN IF NOT EXISTS "assignment_role" text;--> statement-breakpoint
ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "assignment_role" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "storage_nodes" ADD CONSTRAINT "storage_nodes_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "storage_nodes_assigned_user_idx" ON "storage_nodes" USING btree ("assigned_user_id") WHERE "storage_nodes"."deleted_at" is null and "storage_nodes"."assigned_user_id" is not null;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "storage_nodes" ADD CONSTRAINT "storage_nodes_assignment_role_check" CHECK (("storage_nodes"."assigned_user_id" is null) = ("storage_nodes"."assignment_role" is null));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "storage_nodes" ADD CONSTRAINT "storage_nodes_assignee_level_check" CHECK ("storage_nodes"."assigned_user_id" is null or "storage_nodes"."type" in ('warehouse', 'storage_unit'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_assignment_role_check" CHECK (("warehouses"."assigned_user_id" is null) = ("warehouses"."assignment_role" is null));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

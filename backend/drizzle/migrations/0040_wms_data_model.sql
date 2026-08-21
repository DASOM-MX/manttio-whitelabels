CREATE TABLE IF NOT EXISTS "material_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" uuid NOT NULL,
	"lot_number" text NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"storage_node_id" uuid,
	"quantity" numeric(12, 3) NOT NULL,
	"pieces" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "material_lots_lot_location_uq" UNIQUE NULLS NOT DISTINCT("material_id","lot_number","warehouse_id","storage_node_id"),
	CONSTRAINT "material_lots_quantity_nonneg_check" CHECK ("material_lots"."quantity" >= 0),
	CONSTRAINT "material_lots_pieces_nonneg_check" CHECK ("material_lots"."pieces" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "material_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" uuid NOT NULL,
	"serial_number" text NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"storage_node_id" uuid,
	"status" text DEFAULT 'in_stock' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text,
	"upc" text,
	"name" text NOT NULL,
	"description" text,
	"unit" text NOT NULL,
	"tracking" text NOT NULL,
	"min_stock" numeric(12, 3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "movement_reason_defs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"built_in" boolean DEFAULT false NOT NULL,
	"applies_to" text[] NOT NULL,
	"requires_note" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movement_reason_defs_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "movement_units" (
	"movement_id" uuid NOT NULL,
	"material_unit_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movement_units_movement_id_material_unit_id_pk" PRIMARY KEY("movement_id","material_unit_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"direction" text,
	"reason" text NOT NULL,
	"material_id" uuid NOT NULL,
	"quantity" numeric(12, 3),
	"lot_number" text,
	"pieces" integer,
	"from_warehouse_id" uuid,
	"from_node_id" uuid,
	"to_warehouse_id" uuid,
	"to_node_id" uuid,
	"report_id" text,
	"replenishment_id" uuid,
	"count_session_id" uuid,
	"user_id" uuid NOT NULL,
	"notes" text,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movements_readjustment_direction_check" CHECK (("movements"."type" = 'readjustment') = ("movements"."direction" is not null))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "replenishment_import_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"type" text NOT NULL,
	"actor_user_id" uuid,
	"line" integer,
	"reason" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "replenishment_import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"line" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"material_id" uuid,
	"quantity" numeric(12, 3),
	"pieces" integer,
	"serial" text,
	"lot" text,
	"lot_expires_at" timestamp with time zone,
	"storage_node_id" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "replenishment_import_rows_line_uq" UNIQUE("import_id","line")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "replenishment_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"file_key" text NOT NULL,
	"file_name" text NOT NULL,
	"file_deleted_at" timestamp with time zone,
	"detected_fields" jsonb NOT NULL,
	"mapping" jsonb,
	"submission_snapshot" text,
	"warehouse_id" uuid NOT NULL,
	"parent_warehouse_id" uuid NOT NULL,
	"total_rows" integer,
	"processed_rows" integer DEFAULT 0 NOT NULL,
	"error_rows" integer DEFAULT 0 NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"evidence_photos" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "replenishment_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"replenishment_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"quantity" numeric(12, 3),
	"pieces" integer,
	"serials" text[],
	"lot" text,
	"lot_expires_at" timestamp with time zone,
	"storage_node_id" uuid,
	"unprocessable" boolean DEFAULT false NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "replenishments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folio" integer NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"import_id" uuid,
	"evidence_photos" text[] DEFAULT '{}'::text[] NOT NULL,
	"user_id" uuid NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "replenishments_folio_unique" UNIQUE("folio")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" text NOT NULL,
	"material_id" uuid NOT NULL,
	"quantity" numeric(12, 3),
	"lot_number" text,
	"material_unit_id" uuid,
	"source_warehouse_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_materials_material_unit_id_unique" UNIQUE("material_unit_id"),
	CONSTRAINT "report_materials_shape_check" CHECK ((("report_materials"."quantity" is null) <> ("report_materials"."material_unit_id" is null)) and ("report_materials"."lot_number" is null or "report_materials"."quantity" is not null))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_count_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"count_session_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"storage_node_id" uuid,
	"lot_number" text,
	"system_qty" numeric(12, 3) NOT NULL,
	"counted_qty" numeric(12, 3),
	"system_pieces" integer,
	"counted_pieces" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_count_lines_cell_uq" UNIQUE NULLS NOT DISTINCT("count_session_id","material_id","storage_node_id","lot_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_count_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"storage_node_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"blind" boolean NOT NULL,
	"opened_by" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_by" uuid,
	"applied_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"notes" text,
	CONSTRAINT "stock_count_sessions_status_check" CHECK ("stock_count_sessions"."status" in ('open', 'applied', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"storage_node_id" uuid,
	"quantity" numeric(12, 3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_entries_material_location_uq" UNIQUE NULLS NOT DISTINCT("material_id","warehouse_id","storage_node_id"),
	CONSTRAINT "stock_entries_quantity_nonneg_check" CHECK ("stock_entries"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "storage_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"parent_node_id" uuid,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "warehouses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"assigned_user_id" uuid,
	"address" text,
	"location_reference" text,
	"latitude" double precision,
	"longitude" double precision,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "warehouses_locatable_check" CHECK ("warehouses"."location_reference" is not null or ("warehouses"."latitude" is not null and "warehouses"."longitude" is not null)),
	CONSTRAINT "warehouses_coords_pair_check" CHECK (("warehouses"."latitude" is null) = ("warehouses"."longitude" is null))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wms_counters" (
	"id" text PRIMARY KEY NOT NULL,
	"value" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wms_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wms_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "material_lots" ADD CONSTRAINT "material_lots_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "material_lots" ADD CONSTRAINT "material_lots_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "material_lots" ADD CONSTRAINT "material_lots_storage_node_id_storage_nodes_id_fk" FOREIGN KEY ("storage_node_id") REFERENCES "public"."storage_nodes"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "material_units" ADD CONSTRAINT "material_units_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "material_units" ADD CONSTRAINT "material_units_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "material_units" ADD CONSTRAINT "material_units_storage_node_id_storage_nodes_id_fk" FOREIGN KEY ("storage_node_id") REFERENCES "public"."storage_nodes"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movement_units" ADD CONSTRAINT "movement_units_movement_id_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movements"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movement_units" ADD CONSTRAINT "movement_units_material_unit_id_material_units_id_fk" FOREIGN KEY ("material_unit_id") REFERENCES "public"."material_units"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movements" ADD CONSTRAINT "movements_reason_movement_reason_defs_code_fk" FOREIGN KEY ("reason") REFERENCES "public"."movement_reason_defs"("code") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movements" ADD CONSTRAINT "movements_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movements" ADD CONSTRAINT "movements_from_warehouse_id_warehouses_id_fk" FOREIGN KEY ("from_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movements" ADD CONSTRAINT "movements_from_node_id_storage_nodes_id_fk" FOREIGN KEY ("from_node_id") REFERENCES "public"."storage_nodes"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movements" ADD CONSTRAINT "movements_to_warehouse_id_warehouses_id_fk" FOREIGN KEY ("to_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movements" ADD CONSTRAINT "movements_to_node_id_storage_nodes_id_fk" FOREIGN KEY ("to_node_id") REFERENCES "public"."storage_nodes"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movements" ADD CONSTRAINT "movements_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movements" ADD CONSTRAINT "movements_replenishment_id_replenishments_id_fk" FOREIGN KEY ("replenishment_id") REFERENCES "public"."replenishments"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movements" ADD CONSTRAINT "movements_count_session_id_stock_count_sessions_id_fk" FOREIGN KEY ("count_session_id") REFERENCES "public"."stock_count_sessions"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movements" ADD CONSTRAINT "movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "replenishment_import_events" ADD CONSTRAINT "replenishment_import_events_import_id_replenishment_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."replenishment_imports"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "replenishment_import_events" ADD CONSTRAINT "replenishment_import_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "replenishment_import_rows" ADD CONSTRAINT "replenishment_import_rows_import_id_replenishment_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."replenishment_imports"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "replenishment_import_rows" ADD CONSTRAINT "replenishment_import_rows_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "replenishment_import_rows" ADD CONSTRAINT "replenishment_import_rows_storage_node_id_storage_nodes_id_fk" FOREIGN KEY ("storage_node_id") REFERENCES "public"."storage_nodes"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "replenishment_imports" ADD CONSTRAINT "replenishment_imports_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "replenishment_imports" ADD CONSTRAINT "replenishment_imports_parent_warehouse_id_warehouses_id_fk" FOREIGN KEY ("parent_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "replenishment_imports" ADD CONSTRAINT "replenishment_imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "replenishment_items" ADD CONSTRAINT "replenishment_items_replenishment_id_replenishments_id_fk" FOREIGN KEY ("replenishment_id") REFERENCES "public"."replenishments"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "replenishment_items" ADD CONSTRAINT "replenishment_items_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "replenishment_items" ADD CONSTRAINT "replenishment_items_storage_node_id_storage_nodes_id_fk" FOREIGN KEY ("storage_node_id") REFERENCES "public"."storage_nodes"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "replenishments" ADD CONSTRAINT "replenishments_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "replenishments" ADD CONSTRAINT "replenishments_import_id_replenishment_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."replenishment_imports"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "replenishments" ADD CONSTRAINT "replenishments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_materials" ADD CONSTRAINT "report_materials_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_materials" ADD CONSTRAINT "report_materials_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_materials" ADD CONSTRAINT "report_materials_material_unit_id_material_units_id_fk" FOREIGN KEY ("material_unit_id") REFERENCES "public"."material_units"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_materials" ADD CONSTRAINT "report_materials_source_warehouse_id_warehouses_id_fk" FOREIGN KEY ("source_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_count_session_id_stock_count_sessions_id_fk" FOREIGN KEY ("count_session_id") REFERENCES "public"."stock_count_sessions"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_storage_node_id_storage_nodes_id_fk" FOREIGN KEY ("storage_node_id") REFERENCES "public"."storage_nodes"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_count_sessions" ADD CONSTRAINT "stock_count_sessions_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_count_sessions" ADD CONSTRAINT "stock_count_sessions_storage_node_id_storage_nodes_id_fk" FOREIGN KEY ("storage_node_id") REFERENCES "public"."storage_nodes"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_count_sessions" ADD CONSTRAINT "stock_count_sessions_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_count_sessions" ADD CONSTRAINT "stock_count_sessions_applied_by_users_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_entries" ADD CONSTRAINT "stock_entries_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_entries" ADD CONSTRAINT "stock_entries_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_entries" ADD CONSTRAINT "stock_entries_storage_node_id_storage_nodes_id_fk" FOREIGN KEY ("storage_node_id") REFERENCES "public"."storage_nodes"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "storage_nodes" ADD CONSTRAINT "storage_nodes_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "storage_nodes" ADD CONSTRAINT "storage_nodes_parent_node_id_storage_nodes_id_fk" FOREIGN KEY ("parent_node_id") REFERENCES "public"."storage_nodes"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_parent_id_warehouses_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "material_lots_location_idx" ON "material_lots" USING btree ("warehouse_id","storage_node_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "material_units_serial_uidx" ON "material_units" USING btree ("material_id","serial_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "material_units_location_idx" ON "material_units" USING btree ("warehouse_id","storage_node_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "material_units_material_idx" ON "material_units" USING btree ("material_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "materials_sku_uidx" ON "materials" USING btree ("sku") WHERE "materials"."deleted_at" is null and "materials"."sku" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "materials_upc_uidx" ON "materials" USING btree ("upc") WHERE "materials"."deleted_at" is null and "materials"."upc" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "movement_units_unit_idx" ON "movement_units" USING btree ("material_unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "movements_idempotency_key_uidx" ON "movements" USING btree ("idempotency_key") WHERE "movements"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "movements_material_idx" ON "movements" USING btree ("material_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "movements_from_idx" ON "movements" USING btree ("from_warehouse_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "movements_to_idx" ON "movements" USING btree ("to_warehouse_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "movements_report_idx" ON "movements" USING btree ("report_id") WHERE "movements"."report_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "movements_replenishment_idx" ON "movements" USING btree ("replenishment_id") WHERE "movements"."replenishment_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "movements_count_session_idx" ON "movements" USING btree ("count_session_id") WHERE "movements"."count_session_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "replenishment_import_events_import_idx" ON "replenishment_import_events" USING btree ("import_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "replenishment_imports_parent_in_flight_uidx" ON "replenishment_imports" USING btree ("parent_warehouse_id") WHERE "replenishment_imports"."status" in ('uploaded', 'queued', 'processing', 'ready', 'rejected');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "replenishment_imports_warehouse_idx" ON "replenishment_imports" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "replenishment_items_replenishment_idx" ON "replenishment_items" USING btree ("replenishment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_materials_report_idx" ON "report_materials" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_count_sessions_warehouse_idx" ON "stock_count_sessions" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_entries_location_idx" ON "stock_entries" USING btree ("warehouse_id","storage_node_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "storage_nodes_name_in_parent_uidx" ON "storage_nodes" USING btree ("warehouse_id",coalesce("parent_node_id", '00000000-0000-0000-0000-000000000000'::uuid),"name") WHERE "storage_nodes"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "storage_nodes_warehouse_idx" ON "storage_nodes" USING btree ("warehouse_id","parent_node_id") WHERE "storage_nodes"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "warehouses_assigned_user_idx" ON "warehouses" USING btree ("assigned_user_id") WHERE "warehouses"."deleted_at" is null and "warehouses"."assigned_user_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "warehouses_parent_idx" ON "warehouses" USING btree ("parent_id") WHERE "warehouses"."deleted_at" is null;
--> statement-breakpoint
-- Seed: the 14 built-in movement reasons (10-wms/01 §5; the TS mirror the
-- CP-2 verification test checks against lives in
-- `src/modules/wms/constants/movement-reason-seeds.ts` — keep both in sync).
-- Insert-if-missing by `code`: re-running never duplicates and never
-- overwrites what a tenant's database already holds.
INSERT INTO "movement_reason_defs" ("code", "label", "built_in", "applies_to", "requires_note", "active") VALUES
	('replenishment', 'Reabastecimiento', true, ARRAY['inbound'], false, true),
	('refund_by_client', 'Devolución de cliente', true, ARRAY['inbound', 'readjustment_in'], false, true),
	('repair', 'Reparación', true, ARRAY['readjustment_out', 'readjustment_in'], false, true),
	('relocation', 'Reubicación', true, ARRAY['transfer'], false, true),
	('report_binding', 'Consumo en reporte', true, ARRAY['consumption', 'readjustment_in', 'readjustment_out'], false, true),
	('returned_to_client', 'Entregado al cliente', true, ARRAY['readjustment_out'], false, true),
	('return_to_provider', 'Devolución a proveedor (cambio)', true, ARRAY['readjustment_out'], false, true),
	('refund_to_provider', 'Devolución a proveedor (reembolso)', true, ARRAY['readjustment_out'], false, true),
	('damaged_material', 'Material dañado', true, ARRAY['readjustment_out'], false, true),
	('stock_cleaning', 'Depuración de inventario', true, ARRAY['readjustment_out'], false, true),
	('doa', 'Dañado de origen (DOA)', true, ARRAY['readjustment_out'], false, true),
	('scrap', 'Merma', true, ARRAY['readjustment_out'], true, true),
	('lot_expired', 'Lote vencido', true, ARRAY['readjustment_out'], true, true),
	('stock_count', 'Conteo físico', true, ARRAY['readjustment_in', 'readjustment_out'], false, true)
ON CONFLICT ("code") DO NOTHING;

ALTER TABLE "service_orders" ADD COLUMN IF NOT EXISTS "quotation_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "service_orders_quotation_uidx" ON "service_orders" USING btree ("quotation_id") WHERE "service_orders"."quotation_id" is not null;--> statement-breakpoint
-- The reverse link (20 §6): quotations.service_order_id was born FK-less
-- because service_orders didn't exist yet ("the FK is added by 19's DDL" —
-- their model comment). Hand-written: the Drizzle side stays undeclared so the
-- two model files don't import each other (models stay acyclic).
DO $$ BEGIN
 ALTER TABLE "quotations" ADD CONSTRAINT "quotations_service_order_id_service_orders_id_fk" FOREIGN KEY ("service_order_id") REFERENCES "public"."service_orders"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

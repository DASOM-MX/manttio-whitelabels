-- Covered units for contracts (13 §1): the many-to-many between an agreement
-- and the client's equipment. Additive on top of 0036 — a contract with no
-- covered units stays valid, so there is nothing to backfill. `restrict` on both
-- FKs, never cascade (nothing here is ever hard-deleted). Guards make it safe to
-- re-run.
CREATE TABLE IF NOT EXISTS "contract_equipment" (
	"contract_id" uuid NOT NULL,
	"equipment_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_equipment_contract_id_equipment_id_pk" PRIMARY KEY("contract_id","equipment_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contract_equipment" ADD CONSTRAINT "contract_equipment_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contract_equipment" ADD CONSTRAINT "contract_equipment_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contract_equipment_equipment_idx" ON "contract_equipment" USING btree ("equipment_id");
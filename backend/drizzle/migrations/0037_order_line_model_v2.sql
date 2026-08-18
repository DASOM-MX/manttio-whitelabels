-- 19 follow-up: order lines learn the quotation line model (2026-07-31) —
-- off-catalog lines, decimal quantities, per-line discounts. Non-destructive:
-- a NOT NULL drop, an int widened to numeric(12,3) (every existing int is
-- exactly representable), and a defaulted column add.
ALTER TABLE "service_order_services" ALTER COLUMN "service_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "service_order_services" ALTER COLUMN "quantity" SET DATA TYPE numeric(12,3);
--> statement-breakpoint
ALTER TABLE "service_order_services" ALTER COLUMN "quantity" SET DEFAULT '1.000';
--> statement-breakpoint
ALTER TABLE "service_order_services" ADD COLUMN IF NOT EXISTS "discount_amount" numeric(12,2) DEFAULT '0.00' NOT NULL;

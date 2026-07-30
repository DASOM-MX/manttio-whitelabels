-- 20 CP-3 PR-A: quotation line model v2 (decided 2026-07-29) — off-catalog
-- lines, decimal quantities, per-line discount amounts.
--
-- All three are non-destructive on live rows: a NOT NULL drop, an integer
-- widened to numeric (every existing int is exactly representable at scale 3),
-- and a defaulted column add.

ALTER TABLE "quotation_lines" ALTER COLUMN "service_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "quotation_lines" ALTER COLUMN "quantity" SET DATA TYPE numeric(12,3);
--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD COLUMN IF NOT EXISTS "discount_amount" numeric(12,2) DEFAULT '0.00' NOT NULL;

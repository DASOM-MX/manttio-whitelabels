-- Service-orders dispatch polish (19 CP-2b): priority flag + promised date.
-- Planned as 0028 and renumbered to 0029 after #116 took 0028 on main. Additive
-- + idempotence-guarded, applied straight to the shared Neon DB (which runs
-- ahead of the migration journal), so a replay is a no-op.
ALTER TABLE "service_orders" ADD COLUMN IF NOT EXISTS "priority" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN IF NOT EXISTS "promised_date" date;

-- A deleted document keeps its folio (owner 2026-09-03), so neither series ever
-- reissues a number already sent to a client. Fails if a live row and a deleted
-- row already share a folio — they should not, both counters only count up.
DROP INDEX IF EXISTS "quotations_folio_uidx";--> statement-breakpoint
DROP INDEX IF EXISTS "service_orders_folio_uidx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quotations_folio_uidx" ON "quotations" USING btree ("folio");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "service_orders_folio_uidx" ON "service_orders" USING btree ("folio");

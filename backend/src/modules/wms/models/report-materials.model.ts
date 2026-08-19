import { sql } from 'drizzle-orm';
import {
  check,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { reports } from '../../reports/models/reports.model';
import { materialUnits } from './material-units.model';
import { materials } from './materials.model';
import { warehouses } from './warehouses.model';

// CURRENT material-tracking list per report (10-wms/01 §2, links 06/08) —
// current STATE, not audit: `PUT /reports/:id/materials` may replace rows
// freely; the audit lives in `movements` (the consumption + compensating
// readjustments the diff emits under `report_binding`, 08 §3).
//
// Shape per tracking mode (check below + validator): serialized →
// `materialUnitId`; lot → `quantity` + `lotNumber`; unserialized → `quantity`
// alone.
export const reportMaterials = pgTable(
  'report_materials',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reportId: text('report_id')
      .notNull()
      .references(() => reports.id, { onDelete: 'restrict' }),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'restrict' }),
    // Unserialized + lot rows. Whole integers in v1 (00 §6 #22).
    quantity: numeric('quantity', { precision: 12, scale: 3 }),
    // Lot-tracked consumption: which of the van's lots the quantity came from.
    lotNumber: text('lot_number'),
    // A unit is consumed once — plain UNIQUE works because the PUT diff
    // deletes replaced rows (table is current-state); a correction that
    // reverts a unit frees it for re-consumption. Re-confirm during 08 (01
    // open-asks).
    materialUnitId: uuid('material_unit_id')
      .references(() => materialUnits.id, { onDelete: 'restrict' })
      .unique(),
    sourceWarehouseId: uuid('source_warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // The tracking-mode XOR (01 CP-1): exactly one of quantity /
    // materialUnitId, and a lot number only rides a quantity row.
    check(
      'report_materials_shape_check',
      sql`((${table.quantity} is null) <> (${table.materialUnitId} is null)) and (${table.lotNumber} is null or ${table.quantity} is not null)`,
    ),
    index('report_materials_report_idx').on(table.reportId),
  ],
);

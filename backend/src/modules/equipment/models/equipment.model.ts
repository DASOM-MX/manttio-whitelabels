import { sql } from 'drizzle-orm';
import { date, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { customers } from '../../customers/models/customers.model';
import { users } from '../../users/models/users.model';
import { reports } from '../../reports/models/reports.model';
import { EquipmentOrigin, EquipmentStatus } from '../enums/equipment.enum';

// The client's installed units (11 §1). Each belongs to a customer and
// accumulates a derived service history (linked reports, never stored on the
// row). `kind`/`capacity` stay free text in v1 — no invented catalogs.
// Applied directly to the shared Neon DB (ahead-of-migrations rule); no drizzle
// migration file is generated from here.
export const equipment = pgTable(
  'equipment',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    name: text('name'),
    brand: text('brand'),
    model: text('model'),
    serialNumber: text('serial_number'),
    kind: text('kind'),
    capacity: text('capacity'),
    location: text('location'),
    installDate: date('install_date'),
    // How the unit came to be at the client (externo | venta | renta).
    origin: text('origin').$type<EquipmentOrigin>().notNull().default(EquipmentOrigin.Externo),
    // WMS hook (10): the serialized unit this asset came from. No FK yet — the
    // WMS module isn't modeled; a plain uuid backlink until it lands.
    materialUnitId: uuid('material_unit_id'),
    status: text('status').$type<EquipmentStatus>().notNull().default(EquipmentStatus.Active),
    notes: text('notes'),
    // Up to 3 photos of the unit (nameplate / install shot) — R2 CDN URLs, same
    // convention as report pictures. Capped at 3 in the validator.
    photos: text('photos')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    // Audit for the rare soft delete (created-by-mistake only).
    deleteComment: text('delete_comment'),
    deletedBy: uuid('deleted_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('equipment_customer_idx')
      .on(table.customerId)
      .where(sql`${table.deletedAt} is null`),
    index('equipment_serial_idx').on(table.serialNumber),
  ],
);

// report ↔ equipment is many-to-many (11 §2): a service visit often covers
// several units. Detaching is allowed (a categorization fix — the report row is
// untouched). `report_id` is `text` to match the reports PK (folio-style id).
export const equipmentReports = pgTable(
  'equipment_reports',
  {
    equipmentId: uuid('equipment_id')
      .notNull()
      .references(() => equipment.id, { onDelete: 'cascade' }),
    reportId: text('report_id')
      .notNull()
      .references(() => reports.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.equipmentId, table.reportId] }),
    index('equipment_reports_report_idx').on(table.reportId),
  ],
);

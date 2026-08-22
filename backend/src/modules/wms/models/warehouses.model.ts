import { sql } from 'drizzle-orm';
import {
  check,
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { users } from '../../users/models/users.model';
import { AssignmentRole } from '../enums/assignments.enum';

// Warehouses + sub-warehouses (10-wms/01 §2). ONE level of nesting in v1 — the
// service rejects a parent that itself has `parentId` set (`400
// invalid_parent`). `type` (`'warehouse' | 'sub-warehouse'`) is DERIVED from
// `parentId`, never stored.
//
// `assignedUserId` (user 2026-08-08 — was `assignedTechnicianId`): the
// responsible user. A TECHNICIAN assignee makes the warehouse their van
// ("Mi almacén"); an ADMIN assignee is the warehouse/unit manager. A user may
// hold several warehouses — the "one active van per technician" invariant is
// role-aware, so the assignment SERVICE enforces it (`409
// technician_already_assigned`), not the schema.
//
// Delete is soft and empty-only (`409 warehouse_not_empty`): no live child
// warehouses, no `stock_entries` balance, no `in_stock`/`assigned` units
// anywhere in it; its storage nodes soft-delete in the same transaction.
export const warehouses = pgTable(
  'warehouses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    parentId: uuid('parent_id').references((): AnyPgColumn => warehouses.id, {
      onDelete: 'restrict',
    }),
    assignedUserId: uuid('assigned_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    // WHAT that user is to this warehouse (user 2026-08-21) — the user's own
    // role can't say it: the same admin may supervise one warehouse and lead
    // the crew in another. Set with `assignedUserId` or not at all.
    assignmentRole: text('assignment_role').$type<AssignmentRole>(),
    address: text('address'),
    // How people actually find the place when the street address isn't enough
    // — "bodega del fondo, portón azul" (client requirement, 2026-08-08).
    locationReference: text('location_reference'),
    // Optional pin for the same requirement — WGS84, same shape as the report
    // signing coords (`reports.signed_latitude`).
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // Assignee and its role travel together — neither alone.
    check(
      'warehouses_assignment_role_check',
      sql`(${table.assignedUserId} is null) = (${table.assignmentRole} is null)`,
    ),
    // A warehouse MUST be locatable (client requirement, 2026-08-08): a
    // location reference and/or a coordinate pair — never neither.
    check(
      'warehouses_locatable_check',
      sql`${table.locationReference} is not null or (${table.latitude} is not null and ${table.longitude} is not null)`,
    ),
    // Coordinates come as a pair or not at all.
    check(
      'warehouses_coords_pair_check',
      sql`(${table.latitude} is null) = (${table.longitude} is null)`,
    ),
    // Lookup only ("which warehouses does this user hold?" / van resolution) —
    // deliberately NOT unique (user 2026-08-08): managers may hold several.
    index('warehouses_assigned_user_idx')
      .on(table.assignedUserId)
      .where(sql`${table.deletedAt} is null and ${table.assignedUserId} is not null`),
    index('warehouses_parent_idx')
      .on(table.parentId)
      .where(sql`${table.deletedAt} is null`),
  ],
);

import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { users } from '../../users/models/users.model';
import { AssignmentRole } from '../enums/assignments.enum';
import { StorageNodeType } from '../enums/storage-nodes.enum';
import { warehouses } from './warehouses.model';

// Storage-node tree inside a warehouse (10-wms/01 §2). The hierarchy rule is
// rank-based (`constants/storage-node-rank.ts`): parent rank strictly below
// child rank, levels skippable; a ROOT (no parent) may be any type (owner
// 2026-07-20). `type` is immutable after create; moving a node to another
// parent is out of v1 (delete-if-empty + recreate).
//
// SOFT delete (2026-07-19): movements reference nodes forever, so rows must
// outlive the structure. Delete is empty-only (`409 node_not_empty`).
export const storageNodes = pgTable(
  'storage_nodes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'restrict' }),
    parentNodeId: uuid('parent_node_id').references((): AnyPgColumn => storageNodes.id, {
      onDelete: 'restrict',
    }),
    type: text('type').$type<StorageNodeType>().notNull(),
    name: text('name').notNull(),
    // What the node holds / what it is for — free text, optional (user
    // 2026-08-21).
    description: text('description'),
    // How someone actually finds it inside the building — "pasillo 3, pared
    // norte" (user 2026-08-21). Same intent as `warehouses.location_reference`
    // one level down, but never required: a rack inside a named unit is
    // usually self-locating.
    locationReference: text('location_reference'),
    // Who is in charge of this unit and what they are to it (user 2026-08-21)
    // — supervisor / leader / technician. Set together or not at all, and only
    // at the top two levels (checks below).
    assignedUserId: uuid('assigned_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    assignmentRole: text('assignment_role').$type<AssignmentRole>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // Assignee and its role travel together — neither alone.
    check(
      'storage_nodes_assignment_role_check',
      sql`(${table.assignedUserId} is null) = (${table.assignmentRole} is null)`,
    ),
    // Only the two top levels carry someone in charge (user 2026-08-21): a
    // warehouse node or a storage unit, never a rack/section/box. `type` is
    // immutable after create, so the DB can hold this one; the service answers
    // `400 invalid_assignment_level` (02).
    check(
      'storage_nodes_assignee_level_check',
      sql`${table.assignedUserId} is null or ${table.type} in ('warehouse', 'storage_unit')`,
    ),
    // "Which units is this user in charge of?" — live rows only.
    index('storage_nodes_assigned_user_idx')
      .on(table.assignedUserId)
      .where(sql`${table.deletedAt} is null and ${table.assignedUserId} is not null`),
    // Name unique within its parent, live rows only (`409
    // duplicate_node_name`). The plan spec says `UNIQUE NULLS NOT DISTINCT
    // (warehouse_id, parent_node_id, name)` — a partial unique CONSTRAINT
    // doesn't exist in Postgres and drizzle's uniqueIndex can't express NULLS
    // NOT DISTINCT, so root-level nodes (NULL parent) collapse onto the zero
    // uuid inside the index expression instead. Same guarantee: roots dedupe
    // per warehouse, children dedupe per parent.
    uniqueIndex('storage_nodes_name_in_parent_uidx')
      .on(
        table.warehouseId,
        sql`coalesce(${table.parentNodeId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
        table.name,
      )
      .where(sql`${table.deletedAt} is null`),
    index('storage_nodes_warehouse_idx')
      .on(table.warehouseId, table.parentNodeId)
      .where(sql`${table.deletedAt} is null`),
  ],
);

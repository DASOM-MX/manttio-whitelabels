import { sql } from 'drizzle-orm';
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
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
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
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

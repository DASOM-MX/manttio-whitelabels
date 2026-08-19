import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../../users/models/users.model';
import { ImportEventType, ReplenishmentImportStatus } from '../enums/replenishment-imports.enum';
import type {
  DetectedField,
  ReplenishmentFieldMapping,
} from '../types/replenishment-imports.types';
import { materials } from './materials.model';
import { storageNodes } from './storage-nodes.model';
import { warehouses } from './warehouses.model';

// The field-mapped async batch job behind a replenishment (10-wms/01 §2, added
// 2026-07-19, owner ask). THIS ROW IS THE STATUS TRUTH the frontend listens to
// (SSE stream + one-shot reads, 02 §6); processing runs in the backend's
// Cloudflare Queues consumer (11). Only the consumer writes
// `processing → ready/failed` + the progress counters; only the approval
// transaction writes `confirmed`. NEVER deleted — abandoned = `stale`,
// owner-cancelled = `cancelled`; the header persists forever so the audit log
// and `submissionSnapshot` survive approval.
export const replenishmentImports = pgTable(
  'replenishment_imports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    status: text('status')
      .$type<ReplenishmentImportStatus>()
      .notNull()
      .default(ReplenishmentImportStatus.Uploaded),
    // Staged in the transient `manttio-wms-sheets` bucket at upload (07 §4) —
    // the reference the queue consumer pulls the file by. The upload is a COPY
    // (the tenant keeps the original), so the binary has zero archival value:
    // the consumer purges it once fully processed and stamps `fileDeletedAt`;
    // key/name stay as the durable reference alongside the rows' `raw`.
    fileKey: text('file_key').notNull(),
    fileName: text('file_name').notNull(),
    fileDeletedAt: timestamp('file_deleted_at', { withTimezone: true }),
    // Sniffed at upload for the field mapper.
    detectedFields: jsonb('detected_fields').$type<DetectedField[]>().notNull(),
    // Set at /process.
    mapping: jsonb('mapping').$type<ReplenishmentFieldMapping>(),
    // The whole submission as HUMAN-READABLE pretty-printed JSON, stored as
    // PLAIN TEXT — not jsonb — to keep exact formatting: a tamper-evident,
    // exportable audit artifact (owner 2026-07-20). Written at /process:
    // { fileName, warehouse, detectedFields, mapping, submittedBy,
    // submittedAt }. Immutable.
    submissionSnapshot: text('submission_snapshot'),
    // Destination, bound at UPLOAD (warehouse-first, owner 2026-07-21 — no
    // warehouse-less drafts).
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'restrict' }),
    // The destination's PARENT warehouse (itself when it has no parent),
    // resolved + set at upload — the key the one-in-flight index scopes on.
    parentWarehouseId: uuid('parent_warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'restrict' }),
    // Progress counters the processor updates.
    totalRows: integer('total_rows'),
    processedRows: integer('processed_rows').notNull().default(0),
    errorRows: integer('error_rows').notNull().default(0),
    // Whole-file failure detail (status `failed`).
    error: text('error'),
    // Mirror of the queue message's delivery attempt — visibility only;
    // Queues owns retry state, DLQ ⇒ `failed` (11 §3).
    attempts: integer('attempts').notNull().default(0),
    // Approval-stage PREP (owner 2026-07-19): evidence + notes attach AFTER
    // processing, staged here so office can prep and an admin approve later;
    // copied onto the document at approval. Photos live in the permanent
    // `manttio-wms-evidence` bucket (00 §6 #6/#13).
    evidencePhotos: text('evidence_photos').array().notNull().default(sql`'{}'::text[]`),
    notes: text('notes'),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // ONE IN-FLIGHT IMPORT PER PARENT WAREHOUSE (owner 2026-07-20/21, 00 §6
    // #19 — was per-tenant): sub-warehouses/vans share their parent's slot;
    // different parents import concurrently. `rejected` is still in-flight
    // (staging intact). POST maps the violation to `409 import_in_progress`.
    // NOT runtime temp tables — Postgres TEMP tables are session-scoped and
    // can't span the async lifecycle under the pooled WS driver.
    uniqueIndex('replenishment_imports_parent_in_flight_uidx')
      .on(table.parentWarehouseId)
      .where(
        sql`${table.status} in ('uploaded', 'queued', 'processing', 'ready', 'rejected')`,
      ),
    index('replenishment_imports_warehouse_idx').on(table.warehouseId),
  ],
);

// The STAGING ("temp") table (owner 2026-07-19): parsed data lives here, in
// the tenant DB, until approval. MUTABLE while the import is
// `ready`/`rejected` (row PATCH/DELETE, each audited + re-resolved
// server-side, 02 §6). Approval MOVES the data — promoted into the inventory
// tables, then these rows are DELETED in the same transaction; owner-cancel
// truncates them; the daily cron sweeps `stale`/`failed` leftovers (11 §4).
// This is the module's ONE sanctioned hard-delete class (ephemeral pipeline
// artifacts, with the R2 source sheets — 00 §2): staging is scratch, not an
// entity; the permanent record is the promoted document + movements + the
// import header + event log.
export const replenishmentImportRows = pgTable(
  'replenishment_import_rows',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    importId: uuid('import_id')
      .notNull()
      .references(() => replenishmentImports.id, { onDelete: 'restrict' }),
    line: integer('line').notNull(),
    // The mapped source values, for display/debug — the durable content record
    // once the binary is purged.
    raw: jsonb('raw').notNull(),
    // Resolved via SKU-then-UPC; NULL = `unknown_sku`.
    materialId: uuid('material_id').references(() => materials.id, {
      onDelete: 'restrict',
    }),
    quantity: numeric('quantity', { precision: 12, scale: 3 }),
    // Package count for lot rows (user 2026-08-08) — optional mapper target.
    pieces: integer('pieces'),
    serial: text('serial'),
    lot: text('lot'),
    // Parsed from the mapped expiry field when present (2026-07-20).
    lotExpiresAt: timestamp('lot_expires_at', { withTimezone: true }),
    // Optional target node, set by the USER during review — never by the
    // processor.
    storageNodeId: uuid('storage_node_id').references(() => storageNodes.id, {
      onDelete: 'restrict',
    }),
    // ParseRowError code (02 §6); NULL = clean.
    error: text('error'),
  },
  (table) => [
    // Retries upsert by this key — never duplicate rows (idempotent handler).
    unique('replenishment_import_rows_line_uq').on(table.importId, table.line),
  ],
);

// Append-only audit of the WHOLE import lifecycle — start button → admin/owner
// confirmation (owner 2026-07-20, 00 §6 #20). The header persists forever, so
// this log OUTLIVES the ephemeral staged rows. No `deletedAt`, no
// UPDATE/DELETE path — append-only like movements. Each mutating endpoint
// emits its event in-transaction.
export const replenishmentImportEvents = pgTable(
  'replenishment_import_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    importId: uuid('import_id')
      .notNull()
      .references(() => replenishmentImports.id, { onDelete: 'restrict' }),
    type: text('type').$type<ImportEventType>().notNull(),
    // Who did it; NULL for system events (processing_started/processed/failed
    // — emitted by the queue consumer).
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    // Set on row_updated/row_removed — the staged line, NOT an FK (rows
    // vanish at approval).
    line: integer('line'),
    // REQUIRED (validator-level) on row_removed (audit comment), rejected
    // (the admin's feedback shown to office), and cancelled (the owner's
    // reason for the full cancel).
    reason: text('reason'),
    // Event-specific payload: row_updated { field: {from,to} }; row_removed
    // row snapshot; mapping_submitted { warehouse, mapping }; processed
    // { total, errors }; processing_failed { error }; approved { folio,
    // replenishmentId }.
    details: jsonb('details').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // The timeline read (`GET .../audit`, the Historial tab).
    index('replenishment_import_events_import_idx').on(table.importId, table.createdAt),
  ],
);

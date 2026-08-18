import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { customers } from '../../customers/models/customers.model';
import { equipment } from '../../equipment/models/equipment.model';
import { serviceOrders } from '../../service-orders/models/service-orders.model';
import { users } from '../../users/models/users.model';
import type { Role } from '../../users/enums/users.enum';
import { ContractType, ContractFileType } from '../enums/contracts.enum';

// A contract is a **stored document** — the signed pdf/docx/odt/xls/xlsx — plus
// typed metadata and validity dates (13 §1, reworked 2026-07-24).
//
// **Service orders generate contracts 0..n**: a job may produce a guarantee, a
// programmed-maintenance agreement, a rental doc, or none. `serviceOrderId`
// null = standalone (importing existing paper). The FK lives here, not as a
// single `contractId` on the order, precisely because one order can spawn
// several. Restrict, never cascade.
//
// A contract is **not** a visit generator (decided 2026-07-24, reverses the
// earlier recurring-póliza model) — future maintenance is booked as new orders.
//
// **No stored status.** Validity is derived from the dates on read
// (`ContractValidity`); removal is soft delete only ([[no-hard-deletes-ever]]),
// which doubles as early termination since there is no `cancelled` state.
export const contracts = pgTable(
  'contracts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // 'CON-YYYYMMDD-NNNN' from the daily counter below, allocated inside the
    // create transaction.
    folio: text('folio').notNull(),
    // The client the contract is with — **required** (decided 2026-08-18,
    // supersedes the 2026-07-22 nullable filing model). It is the always-present
    // anchor the §3 audit trail hangs on: every contract event appends to this
    // customer's timeline. Imported paper is filed against a customer record,
    // creating one first if needed.
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    // The order that generated this contract; null = standalone (13 §2).
    serviceOrderId: uuid('service_order_id').references(() => serviceOrders.id, {
      onDelete: 'restrict',
    }),
    // Title, e.g. "Garantía compresor — Hotel X".
    name: text('name').notNull(),
    type: text('type').$type<ContractType>().notNull(),
    description: text('description'),
    // The stored document (13 §1.2). `fileKey` is the **private** R2 object key
    // and never leaves the backend — downloads stream through
    // GET /contracts/:id/file, which re-checks access on every request. There is
    // deliberately no public URL column: a signed contract must not be readable
    // by anyone who once saw a link.
    fileKey: text('file_key').notNull(),
    fileName: text('file_name').notNull(),
    fileType: text('file_type').$type<ContractFileType>().notNull(),
    // Exact content-type, for the download response header. `fileType` is the
    // coarse queryable classification; this is what the browser needs.
    fileMime: text('file_mime').notNull(),
    fileSize: integer('file_size'),
    // Which non-manager roles may view/download this contract (13 §4). Owner +
    // admin always see everything and are the only ones who may set this.
    // Default = all staff; owners *restrict* it per contract for sensitive docs.
    visibleToRoles: text('visible_to_roles')
      .array()
      .$type<Role[]>()
      .notNull()
      .default(sql`'{office,technician}'::text[]`),
    // Plain 'YYYY-MM-DD' strings (`date` columns).
    validFromDate: date('valid_from_date').notNull(),
    // Nullable — some contracts never expire (decided 2026-07-24).
    expiryDate: date('expiry_date'),
    // Lowercase + trimmed on write; the GIN index is the search index.
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    // Audit for the soft delete, which is also how early termination is recorded.
    deleteComment: text('delete_comment'),
    deletedBy: uuid('deleted_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('contracts_folio_uidx').on(table.folio),
    index('contracts_customer_idx')
      .on(table.customerId)
      .where(sql`${table.deletedAt} is null`),
    // "Which contracts did this job produce" — the 19 order-view card.
    index('contracts_order_idx')
      .on(table.serviceOrderId)
      .where(sql`${table.serviceOrderId} is not null`),
    index('contracts_tags_gin_idx').using('gin', table.tags),
    // Role-scoped list reads filter on containment (13 §4).
    index('contracts_visible_roles_gin_idx').using('gin', table.visibleToRoles),
    check(
      'contracts_type_check',
      sql`${table.type} in ('programmed_maintenance', 'corrective_maintenance', 'preventive_maintenance', 'installation', 'rent', 'sell', 'buy', 'guarantee')`,
    ),
    check(
      'contracts_file_type_check',
      sql`${table.fileType} in ('pdf', 'docx', 'odt', 'xls', 'xlsx')`,
    ),
  ],
);

// Daily folio sequence, same mechanics as `report_counters` /
// `service_order_counters`: the create transaction upserts the row and reads
// back the incremented value, so two concurrent creates can never share a
// number.
export const contractCounters = pgTable('contract_counters', {
  day: date('day').primaryKey(),
  lastNumber: integer('last_number').notNull(),
});

// contract ↔ equipment is many-to-many (13 §1): one agreement usually covers
// several of the client's units — a programmed-maintenance contract for a whole
// chiller room, a guarantee for a single compressor. Optional: a contract with
// no covered units is perfectly valid (a rental agreement, an NDA).
//
// The set is **client-scoped**: every linked unit must belong to the contract's
// `customerId`, which the service asserts on write. Editable after creation
// (unlike `visit_equipment`), because a contract's covered list is a statement
// about the agreement rather than a record of what a technician touched — the
// PATCH replaces the whole set and names the before/after in the audit entry.
//
// `restrict` on both sides, never cascade: nothing here is ever hard-deleted, so
// the constraint is a guard rail that should never fire. Deleting rows from this
// table on a replace does not breach that rule — these are pure associations,
// not domain entities (the `visit_equipment` precedent, owner 2026-08-06).
export const contractEquipment = pgTable(
  'contract_equipment',
  {
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id, { onDelete: 'restrict' }),
    equipmentId: uuid('equipment_id')
      .notNull()
      .references(() => equipment.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.contractId, table.equipmentId] }),
    // "Every contract covering this unit" — the 11 equipment view's coverage card.
    index('contract_equipment_equipment_idx').on(table.equipmentId),
  ],
);

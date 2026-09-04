import { sql } from 'drizzle-orm';
import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../../users/models/users.model';
import { customers } from '../../customers/models/customers.model';
import { services } from '../../services/models/services.model';
import { ServiceOrderPriority, ServiceOrderStatus } from '../enums/service-orders.enum';
import type { ServiceTaxRate, ServiceUom } from '../../services/enums/services.enum';

// The commercial job (19 §1): what was sold to whom. One order composes 1..n
// catalog services for one client and owns the reports exploded from them
// (and, from CP-3, the visits scheduled against it).
//
// **Near-immutable by design** (19 §1): everything is fixed at creation except
// `comments` (any staff) and `location` (owner/admin only). Customer, lines and
// folio never change; status moves only through POST /:id/status. Both allowed
// mutations append an event to the order timeline.
//
// Two birth routes (19 §1): the direct order-builder path and the quote
// conversion (20 §6). The link to the originating quote lives on
// `quotations.service_order_id` only (owner 2026-09-01) — one column, one
// direction, set by the conversion transaction.
export const serviceOrders = pgTable(
  'service_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Display folio, 'OS-YYYYMMDD-NNNN'. The uuid is the key; this is what
    // humans quote at each other (19 §1, decided 2026-07-23).
    folio: text('folio').notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    // Service site. Free text in v1; owner/admin may edit it after creation,
    // office may not (19 §3).
    location: text('location'),
    // Dispatch priority (CP-2b; ladder widened 2026-07-31): low → urgent, any
    // staff may move it while the order is open. Logistics metadata, not
    // commercial core.
    priority: text('priority')
      .$type<ServiceOrderPriority>()
      .notNull()
      .default(ServiceOrderPriority.Normal),
    // The "fecha compromiso" told to the client (CP-2b). Date-only on purpose:
    // promises are day-granular, and a timestamptz would drag timezone math
    // into every compare. Overdue = open AND promised_date < CURRENT_DATE.
    promisedDate: date('promised_date'),
    status: text('status')
      .$type<ServiceOrderStatus>()
      .notNull()
      .default(ServiceOrderStatus.Open),
    // The only freely-mutable field (any staff role).
    comments: text('comments'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Folios are handed to clients, so the number a client already has must never
    // name a second order. Unconditional since 2026-09-03 (owner), reversing the
    // earlier "a tombstoned folio is history": `service_order_counters` only
    // counts up, so the predicate released a number the counter was never going
    // to reuse — it only made a duplicate possible. Matches the quotation and
    // service-request folio indexes.
    uniqueIndex('service_orders_folio_uidx').on(table.folio),
    // The customer-view card and the ?customerId list filter.
    index('service_orders_customer_idx')
      .on(table.customerId)
      .where(sql`${table.deletedAt} is null`),
    index('service_orders_status_idx')
      .on(table.status)
      .where(sql`${table.deletedAt} is null`),
  ],
);

// One sold line: a catalog service at the price it sold for (19 §1).
//
// `serviceName` / `uom` / `taxRate` / `unitPrice` are **snapshots** captured at
// creation, not reads through the FK — repricing or soft-deleting a service
// must never rewrite what a client already agreed to. When 20 lands, these come
// from the accepted quotation's frozen line instead of the live catalog, which
// is what keeps quote ↔ order ↔ invoice aligned.
//
// `technicianId` and `reportType` are deliberately **not** columns: they are
// explosion *inputs* (19 §1), consumed by the create transaction and then owned
// by each exploded report (`assignedTo` / `reportType`), which is individually
// reassignable afterwards. Storing a copy here would go stale on the first
// reassignment and invite two answers to "who is doing this?".
export const serviceOrderServices = pgTable(
  'service_order_services',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    serviceOrderId: uuid('service_order_id')
      .notNull()
      .references(() => serviceOrders.id, { onDelete: 'restrict' }),
    // NULL = an OFF-CATALOG line (line model v2, 2026-07-31): a one-off concept
    // typed in full, mirroring `quotation_lines`. The unique index below still
    // holds — Postgres treats NULLs as distinct, so off-catalog lines never
    // collide with each other.
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'restrict' }),
    serviceName: text('service_name').notNull(),
    uom: text('uom').$type<ServiceUom>().notNull(),
    taxRate: text('tax_rate').$type<ServiceTaxRate>().notNull(),
    // Units sold — `numeric(12,3)`, so 1.5 h and 12.75 m² are sellable (line
    // model v2). This is a MONEY multiplier only: how many reports a line
    // explodes is a separate, explicit count (19 §2, owner 2026-07-31), because
    // 1.5 hours is one job that takes 1.5 hours, not 1.5 jobs. The count is not
    // a column for the same reason `technicianId` isn't — it is an explosion
    // input, and the exploded report rows are its record.
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull().default('1.000'),
    unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
    // Frozen amount, never a percent — CFDI's per-concepto Descuento, inherited
    // verbatim from the quotation line when the order is born from a quote.
    discountAmount: numeric('discount_amount', { precision: 12, scale: 2 })
      .notNull()
      .default('0.00'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('service_order_services_order_idx').on(table.serviceOrderId),
    // One line per service per order — quantity is how you sell more of one
    // thing, not a second line (19 §1).
    uniqueIndex('service_order_services_order_service_uidx').on(
      table.serviceOrderId,
      table.serviceId,
    ),
  ],
);

// Daily folio sequence, same mechanics as `report_counters`: the create
// transaction upserts the row and reads back the incremented value, so two
// concurrent orders can never take the same number.
export const serviceOrderCounters = pgTable('service_order_counters', {
  day: date('day').primaryKey(),
  lastNumber: integer('last_number').notNull(),
});

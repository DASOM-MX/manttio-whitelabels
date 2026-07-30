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
import { quotations } from '../../quotations/models/quotations.model';
import { ServiceOrderStatus } from '../enums/service-orders.enum';
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
// Two birth routes (19 §1, linked 2026-07-27): the direct order-builder path
// (`quotationId` null) and the quote conversion (20 §6), which stamps the
// accepted quotation it was born from.
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
    // The accepted quotation this order was born from (20 §6); null for
    // directly-created orders — both paths allowed (decided 2026-07-24).
    // Immutable, like everything else fixed at creation. The reverse link
    // (`quotations.serviceOrderId`) is set in the same conversion transaction;
    // its FK lives in SQL only — declaring both sides in Drizzle would make
    // the two model files import each other (models stay acyclic).
    quotationId: uuid('quotation_id').references(() => quotations.id, {
      onDelete: 'restrict',
    }),
    // Service site. Free text in v1; owner/admin may edit it after creation,
    // office may not (19 §3).
    location: text('location'),
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
    // Folios are handed to clients, so uniqueness is enforced across live rows.
    // Tombstoned orders are exempt: a soft-deleted folio is history, not a name
    // to defend (same posture as the services catalog code).
    uniqueIndex('service_orders_folio_uidx')
      .on(table.folio)
      .where(sql`${table.deletedAt} is null`),
    // The customer-view card and the ?customerId list filter.
    index('service_orders_customer_idx')
      .on(table.customerId)
      .where(sql`${table.deletedAt} is null`),
    index('service_orders_status_idx')
      .on(table.status)
      .where(sql`${table.deletedAt} is null`),
    // One order per quotation, ever — the conversion is a terminal one-shot
    // (the quote flips to `order_created`); the index makes the invariant hold
    // even against a race the status guard somehow missed. Doubles as the
    // lookup for "which order did this quote become".
    uniqueIndex('service_orders_quotation_uidx')
      .on(table.quotationId)
      .where(sql`${table.quotationId} is not null`),
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
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'restrict' }),
    serviceName: text('service_name').notNull(),
    uom: text('uom').$type<ServiceUom>().notNull(),
    taxRate: text('tax_rate').$type<ServiceTaxRate>().notNull(),
    // Units sold. Each unit explodes its own report (19 §2, decided
    // 2026-07-23), so a `quantity: 3` line is 3 independently-assignable jobs.
    quantity: integer('quantity').notNull().default(1),
    unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
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

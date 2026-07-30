import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { customers } from '../../customers/models/customers.model';
import { users } from '../../users/models/users.model';
import { QuotationStatus } from '../enums/quotations.enum';

// The sales entry point (20 §1) — a priced proposal built from catalog services
// (18), mailed to the client's contacts (07), and eventually converted into a
// service order (19). Its lines freeze the catalog at creation, so a quote is a
// commitment: repricing a service never rewrites a quote already sent.
//
// Applied directly to the shared Neon DB (ahead-of-migrations rule); the
// idempotent DDL is recorded in `drizzle/migrations/0023_quotations.sql`.
export const quotations = pgTable(
  'quotations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // 'COT-YYYYMMDD-NNNN', from the `quotation_counters` upsert.
    folio: text('folio').notNull(),
    // Restrict, never cascade — a quote is a commercial record and outlives any
    // tidy-up of the customer (which is soft-deleted anyway).
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    // Closed list (`QuotationStatus`), validator-enforced. No DB check
    // constraint — same posture as `services.taxRate`/`uom`: the Drizzle model
    // stays the single source of truth, and the tally re-derives this value
    // often enough that a constraint would be one more place to keep in sync.
    status: text('status').$type<QuotationStatus>().notNull().default(QuotationStatus.Draft),
    // A calendar date, not an instant: a quote expires at the end of a day in
    // the tenant's reckoning, and `date` avoids a timezone turning that into
    // the day before. Overdue-ness is computed on read (owner 2026-07-26) —
    // there is deliberately no stored flag and no cron to keep it fresh.
    validUntil: date('valid_until').notNull(),
    // Terms / conditions shown on the quote. Mutable in `draft` only.
    comments: text('comments'),
    // Revision chain: this quote replaces a prior one (20 §2). A revise makes a
    // NEW linked draft and cancels the old — never in-place versioning, so a
    // client who already saw v1 can still open the link they were sent.
    supersedesQuotationId: uuid('supersedes_quotation_id').references(
      (): AnyPgColumn => quotations.id,
      { onDelete: 'restrict' },
    ),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    // The mandatory "why" behind either terminal action (cancel / create
    // order). Always present once resolved — that is the whole point of making
    // both actions carry a comment (20 §2).
    resolutionReason: text('resolution_reason'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    orderCreatedAt: timestamp('order_created_at', { withTimezone: true }),
    resolvedByUserId: uuid('resolved_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    // The convergence (20 §6): the service order this quote became, set by the
    // conversion transaction (linked 2026-07-27). The FK lives in SQL only
    // (0027) — `service_orders.quotationId` already declares its side in
    // Drizzle, and declaring both would make the two model files import each
    // other (models stay acyclic; relations live in the barrel).
    serviceOrderId: uuid('service_order_id'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    // Audited soft delete, same shape as users/services/equipment — a quote is
    // a commercial record, so removing it from view has to say who and why.
    // Distinct from `cancelled`: cancelling retires a quote the client can
    // still be shown, deleting takes it out of the tenant's own lists.
    deleteComment: text('delete_comment'),
    deletedBy: uuid('deleted_by').references(() => users.id, { onDelete: 'restrict' }),
    // Soft delete only — no hard deletes anywhere in this codebase.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // Live folios only: a tombstoned quote releases its folio rather than
    // blocking the counter forever.
    uniqueIndex('quotations_folio_uidx')
      .on(table.folio)
      .where(sql`${table.deletedAt} is null`),
    // The list is always "this customer's quotes, newest first" or a status
    // filter across all of them.
    index('quotations_customer_idx').on(table.customerId, table.createdAt),
    index('quotations_status_idx').on(table.status),
  ],
);

// Per-day folio sequence, mirroring `report_counters`. Its own table: quotes
// and reports are separate document series, and sharing a counter would punch
// gaps in each that read as lost records.
export const quotationCounters = pgTable('quotation_counters', {
  day: date('day').primaryKey(),
  lastNumber: integer('last_number').notNull(),
});

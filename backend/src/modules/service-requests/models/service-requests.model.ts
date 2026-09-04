import { date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { customers } from '../../customers/models/customers.model';
import { customerContacts } from '../../customers/models/customer-contacts.model';
import { equipment } from '../../equipment/models/equipment.model';
import { portalUsers } from '../../portal/models/portal-users.model';
import { quotations } from '../../quotations/models/quotations.model';
import { ServiceRequestStatus } from '../enums/service-requests.enum';

// The customer-authored problem report (client-portal 00 §3.13). Deliberately not a
// quotation draft: no lines, no quantities, no prices, no catalog exposure. Each
// request may spawn several quotations over its life — the full set hangs off
// `quotations.service_request_id` (§6b); `quotation_id` here is the backtrack.
export const serviceRequests = pgTable(
  'service_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // 'SOL-YYYYMMDD-NNNN', from the `service_request_counters` upsert.
    folio: text('folio').notNull(),
    // Restrict, never cascade — a request is a service record and outlives any
    // tidy-up of the customer (which is soft-deleted anyway).
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    // The audit record for "on behalf of" (00 §3.7): the record belongs to the
    // customer, this column says which human filed it.
    contactId: uuid('contact_id')
      .notNull()
      .references(() => customerContacts.id, { onDelete: 'restrict' }),
    // Null when staff filed it for a client who phoned in (superadmin 27 supports this).
    portalUserId: uuid('portal_user_id').references(() => portalUsers.id, {
      onDelete: 'restrict',
    }),
    // Nullable, confirmed (A9): the unit may simply never have been registered,
    // and that must not block the request. Staff may create the equipment record
    // from the request view and attach it later (A17).
    equipmentId: uuid('equipment_id').references(() => equipment.id, { onDelete: 'restrict' }),
    // The behavior description — what the unit is doing. Min length enforced in the validator.
    description: text('description').notNull(),
    // Up to 3 image URLs, same convention and cap as `equipment.photos`. Bucket
    // `manttio-customer-report` (A5) — its own bucket with its own lifecycle.
    evidence: text('evidence').array().notNull().default([]),
    // Closed list (`ServiceRequestStatus`), validator-enforced. No DB check
    // constraint — same posture as quotations.
    status: text('status')
      .$type<ServiceRequestStatus>()
      .notNull()
      .default(ServiceRequestStatus.Submitted),
    // Backtrack to the quotation this request produced (owner 2026-09-01). Null
    // until one is issued; `quotations.service_request_id` (§6b) holds the full set.
    quotationId: uuid('quotation_id').references(() => quotations.id, {
      onDelete: 'restrict',
    }),
    // Set when the customer's portal admin closes it (A6).
    closedAt: timestamp('closed_at', { withTimezone: true }),
    // Who closed it. Always a portal user with `is_admin`.
    closedByPortalUserId: uuid('closed_by_portal_user_id').references(
      () => portalUsers.id,
      { onDelete: 'restrict' },
    ),
    // Soft delete, added 2026-09-03 with the portal cancel. This is the only
    // removal a request has: `deleted_at` is stamped by the cancel and by
    // nothing else, so a soft-deleted request is always a cancelled one.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    // Who cancelled. Always a portal user holding `cancel_service_requests` —
    // the reason lives on the `service_request_cancelled` event, where the rest
    // of this module keeps its reasons.
    deletedByPortalUserId: uuid('deleted_by_portal_user_id').references(
      () => portalUsers.id,
      { onDelete: 'restrict' },
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // The folio is the handle a customer quotes on the phone — it must resolve
    // to one request. Unconditional on purpose: a cancelled request keeps its
    // folio, so the series never reissues a number someone already quoted.
    uniqueIndex('service_requests_folio_uidx').on(table.folio),
    // The portal list is always "this customer's requests, newest first".
    index('service_requests_customer_idx').on(table.customerId, table.createdAt),
    // The staff triage queue filters by status.
    index('service_requests_status_idx').on(table.status, table.createdAt),
    // The per-unit history in module 11 (equipment timeline).
    index('service_requests_equipment_idx').on(table.equipmentId),
  ],
);

// Per-day folio sequence, mirroring `quotation_counters` and `report_counters`.
// Service requests are their own document series.
export const serviceRequestCounters = pgTable('service_request_counters', {
  day: date('day').primaryKey(),
  lastNumber: integer('last_number').notNull(),
});

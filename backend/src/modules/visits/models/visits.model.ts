import { sql } from 'drizzle-orm';
import {
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { customers } from '../../customers/models/customers.model';
import { users } from '../../users/models/users.model';
import { reports } from '../../reports/models/reports.model';
import { equipment } from '../../equipment/models/equipment.model';
import { serviceOrders } from '../../service-orders/models/service-orders.model';
import { VisitStatus, type VisitCloseReason } from '../enums/visits.enum';

// Scheduled visits (12 §1) — who goes where, when. An **immutable record**
// (decided 2026-07-23): fixed at creation, correctable only while `scheduled`,
// terminal the moment a technician acts. "Moving" a visit that couldn't be
// served is close + reschedule, which mints a new linked record rather than
// mutating this one.
//
// ~~Applied directly to the shared Neon DB (ahead-of-migrations rule)~~ —
// **that rule is revoked** (owner, 2026-08-01) and the comment was wrong twice
// over: the CP-1 DDL was never actually applied, so the shared database still
// carried the pre-pivot table. `0031_visits_duration_actuals.sql` is the
// migration that creates this table on a fresh tenant and reconciles the shared
// one additively.
export const scheduledVisits = pgTable(
  'scheduled_visits',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Display code, `V-YYYYMMDD-NNNN` (owner 2026-08-02). The uuid is the key;
    // this is what people say out loud, paste into a search box and write on a
    // work slip. **Backend-minted, never staff-authored** — same mechanics as
    // the order folio and report id: a daily counter bumped inside the create
    // transaction, so two concurrent bookings can never take one number.
    internalCode: text('internal_code').notNull(),
    // The parent order (19 §1). The plan's end state is **NOT NULL** — every
    // visit belongs to exactly one order — but it stays nullable until the
    // service-orders module is finished, so the calendar is usable before
    // orders are the only way to schedule work.
    //
    // The FK is real even so: Postgres enforces it only on non-null values, so
    // a bound visit can never point at a missing order, and flipping to NOT
    // NULL later is a one-line change plus a backfill rather than a new
    // constraint. A visit with no order simply contributes nothing to any
    // timeline (see `visit-audit.service.ts`).
    serviceOrderId: uuid('service_order_id').references(() => serviceOrders.id, {
      onDelete: 'restrict',
    }),
    // Denormalized from the parent order when there is one, so the week query
    // can filter and label chips without joining orders. Where both are present
    // the **order is the authority** on which client a job is for — the create
    // path rejects a pair that disagrees rather than silently picking one.
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    // Null = unassigned (the calendar's backlog lane). Mutable **only** while
    // `scheduled`, via `/assign` — never through the correction PATCH.
    technicianId: uuid('technician_id').references(() => users.id, { onDelete: 'restrict' }),
    // --- PLANNED: what office booked ---
    scheduledStart: timestamp('scheduled_start', { withTimezone: true }).notNull(),
    // ~~Optional by design ("morning-ish")~~ — **superseded 2026-07-31 (owner)**:
    // the calendar renders a visit as a block and a block needs a height, so
    // every visit now carries a planned length. This column is **kept** rather
    // than derived, as a fast reference for range reads — but it is never an
    // independent input: the service writes it as
    // `scheduledStart + expectedDurationMinutes` on every path that touches
    // either, so the two can never disagree.
    scheduledEnd: timestamp('scheduled_end', { withTimezone: true }),
    // The planned length. Required, defaulting to an hour — a booking made
    // without thinking about duration is an hour long, not undefined.
    expectedDurationMinutes: integer('expected_duration_minutes').notNull().default(60),

    // --- ACTUAL: what happened (plan vs actual, owner 2026-07-31) ---
    // Stamped by the field app's Iniciar / Terminar. The timestamps are
    // **client-supplied and trusted** (validated, not invented): the field app
    // queues these offline, so the moment recorded must be the tap, not the
    // sync. Null until the technician acts — a visit nobody started has no
    // truthful actual to report.
    actualStart: timestamp('actual_start', { withTimezone: true }),
    actualEnd: timestamp('actual_end', { withTimezone: true }),
    // Stored rather than derived from the two stamps above: a visit can reach
    // Terminar with no Iniciar behind it (forgotten tap, lost queue entry), and
    // the duration still has to be reportable for billing. The service is the
    // single writer and always recomputes it from the pair when both exist.
    actualDurationMinutes: integer('actual_duration_minutes'),

    status: text('status').$type<VisitStatus>().notNull().default(VisitStatus.Scheduled),
    // Both set together, only on close. Required category + optional note —
    // except for `other`, where the service layer demands the note (a bare
    // "other" tells the client handoff nothing).
    closeReason: text('close_reason').$type<VisitCloseReason>(),
    closeNote: text('close_note'),
    // Chain link: the closed visit THIS row replaces. Self-referential, so the
    // callback needs the explicit `AnyPgColumn` return type — without it the
    // inferred type is circular and tsc gives up.
    rescheduledFromId: uuid('rescheduled_from_id').references(
      (): AnyPgColumn => scheduledVisits.id,
      { onDelete: 'restrict' },
    ),
    // The report this visit produced, when it produced one. `text`, not `uuid`:
    // reports are keyed by their folio-style id.
    reportId: text('report_id').references(() => reports.id, { onDelete: 'restrict' }),
    // Short chip label; readers fall back to the customer name when absent.
    title: text('title'),
    notes: text('notes'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    // Audited soft delete, same shape as users/equipment/services. No endpoint
    // writes these in CP-1 — the lifecycle's own removal mechanism is *closing*
    // a visit with a reason, which keeps it in the order's history where the
    // audit trail wants it. The columns exist so that if a hard-mistake purge
    // is ever needed it lands as a soft delete like every other entity, never
    // as a DELETE.
    deleteComment: text('delete_comment'),
    deletedBy: uuid('deleted_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Codes are searched by **equality or prefix** (`V-2026`, `V-20260802-0007`)
    // — owner 2026-08-02 — which is exactly what a btree serves. A `%fragment%`
    // search would not use this index at all and was deliberately not chosen; it
    // would have meant `pg_trgm` in every tenant database.
    //
    // Unique so a code names one visit. Partial on live rows only: a tombstoned
    // visit's code is history, not a name still in use. (No longer the order
    // folio's posture — that one went unconditional on 2026-09-03.)
    uniqueIndex('scheduled_visits_internal_code_uidx')
      .on(table.internalCode)
      .where(sql`${table.deletedAt} is null`),
    // The calendar's only read shape: a bounded date range, optionally narrowed
    // to one technician or client. Partial on live rows — every read filters
    // tombstones, so the index shouldn't carry them.
    index('scheduled_visits_start_idx')
      .on(table.scheduledStart)
      .where(sql`${table.deletedAt} is null`),
    index('scheduled_visits_technician_idx')
      .on(table.technicianId, table.scheduledStart)
      .where(sql`${table.deletedAt} is null`),
    index('scheduled_visits_customer_idx')
      .on(table.customerId, table.scheduledStart)
      .where(sql`${table.deletedAt} is null`),
    // Every visit on one order — what 19's order view reads.
    index('scheduled_visits_order_idx')
      .on(table.serviceOrderId)
      .where(sql`${table.deletedAt} is null`),
    // A closed visit has **at most one** successor. Enforced here rather than in
    // the service because two concurrent reschedules would otherwise both pass a
    // read-then-write check and silently fork the chain. Tombstoned rows are
    // exempt so a soft-deleted successor releases the slot.
    uniqueIndex('scheduled_visits_rescheduled_from_uidx')
      .on(table.rescheduledFromId)
      .where(sql`${table.rescheduledFromId} is not null and ${table.deletedAt} is null`),
  ],
);

// visit ↔ equipment is many-to-many (12 §1): one visit often covers several of
// the client's units. Set at creation and fixed thereafter — the correction
// PATCH deliberately does not touch it (12 §4 scopes correction to
// date/title/notes), so a wrong unit list is a close + reschedule like any
// other planning mistake.
//
// `restrict` on both sides, never cascade: nothing in this codebase is ever
// hard-deleted, so the constraint is a guard rail that should never fire.
export const visitEquipment = pgTable(
  'visit_equipment',
  {
    visitId: uuid('visit_id')
      .notNull()
      .references(() => scheduledVisits.id, { onDelete: 'restrict' }),
    equipmentId: uuid('equipment_id')
      .notNull()
      .references(() => equipment.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.visitId, table.equipmentId] }),
    // "Every visit that touched this unit" — the equipment view's service plan.
    index('visit_equipment_equipment_idx').on(table.equipmentId),
  ],
);

// Daily code sequence for `scheduled_visits.internal_code` (owner 2026-08-02),
// same mechanics as `service_order_counters` and `report_counters`: the create
// transaction upserts the row and reads back the incremented value, so two
// concurrent bookings can never take the same number. Counters are not entities
// — no soft-delete columns, nothing ever removes a row.
export const visitCounters = pgTable('visit_counters', {
  day: date('day').primaryKey(),
  lastNumber: integer('last_number').notNull(),
});

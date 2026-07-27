import { sql } from 'drizzle-orm';
import {
  index,
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
// Applied directly to the shared Neon DB (ahead-of-migrations rule) — no
// drizzle migration file is generated from here.
export const scheduledVisits = pgTable(
  'scheduled_visits',
  {
    id: uuid('id').defaultRandom().primaryKey(),
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
    scheduledStart: timestamp('scheduled_start', { withTimezone: true }).notNull(),
    // Optional by design: plenty of SMB visits are booked as "morning-ish" and
    // forcing an end time would invent precision the office doesn't have.
    scheduledEnd: timestamp('scheduled_end', { withTimezone: true }),
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

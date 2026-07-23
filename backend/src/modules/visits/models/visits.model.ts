import { sql } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { customers } from '../../customers/models/customers.model';
import { users } from '../../users/models/users.model';
import { reports } from '../../reports/models/reports.model';
import { VisitEventType, VisitStatus } from '../enums/visits.enum';
import type { VisitChanges } from '../types/visits.types';

// A visit is a *plan*; a report is what *happened* (12-calendar §1). They link
// (`report_id` set on completion) but neither replaces the other. Cancelled
// visits stay visible (struck-through in the UI) — soft delete exists only for
// true mistakes, per the global no-hard-delete rule.
export const scheduledVisits = pgTable(
  'scheduled_visits',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    // null = unassigned (the backlog lane). Mutated only through the audited
    // /assign path — this column is just the latest assignment's target.
    technicianId: uuid('technician_id').references(() => users.id, { onDelete: 'restrict' }),
    scheduledStart: timestamp('scheduled_start', { withTimezone: true }).notNull(),
    // Optional — many SMB visits are "morning-ish", not a fixed slot.
    scheduledEnd: timestamp('scheduled_end', { withTimezone: true }),
    status: text('status').$type<VisitStatus>().notNull().default(VisitStatus.Scheduled),
    // Required by the service when rescheduling ("could not be served" — 12 §1
    // 2026-07-23); optional context on cancel/missed; cleared on reopen.
    statusReason: text('status_reason'),
    // Chain link: set on the replacement record the reschedule path opens.
    rescheduledFromId: uuid('rescheduled_from_id').references(
      (): AnyPgColumn => scheduledVisits.id,
      { onDelete: 'restrict' },
    ),
    // Text to match the reports folio PK; set when the visit produced a report.
    reportId: text('report_id').references(() => reports.id, { onDelete: 'restrict' }),
    // Short label; the UI falls back to the customer name.
    title: text('title'),
    notes: text('notes'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // The calendar always reads by visible range.
    index('scheduled_visits_start_idx')
      .on(table.scheduledStart)
      .where(sql`${table.deletedAt} is null`),
    index('scheduled_visits_technician_idx')
      .on(table.technicianId, table.scheduledStart)
      .where(sql`${table.deletedAt} is null`),
    index('scheduled_visits_customer_idx')
      .on(table.customerId, table.scheduledStart)
      .where(sql`${table.deletedAt} is null`),
    // Forward chain resolution: "this visit was rescheduled to …".
    index('scheduled_visits_rescheduled_from_idx').on(table.rescheduledFromId),
    check(
      'scheduled_visits_status_check',
      sql`${table.status} in ('scheduled', 'completed', 'cancelled', 'missed', 'rescheduled')`,
    ),
  ],
);

// Append-only audit log for every visit mutation (12-calendar §1, 2026-07-23):
// what happened, by whom, when. No updates or deletes, ever — the trail IS the
// audit. `assigned` events use the typed from/to technician columns (null on
// either side = the unassigned backlog lane); the other event types describe
// the change through `changes` (field → { from, to }) and `note`.
export const visitEvents = pgTable(
  'visit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    visitId: uuid('visit_id')
      .notNull()
      .references(() => scheduledVisits.id, { onDelete: 'restrict' }),
    type: text('type').$type<VisitEventType>().notNull(),
    // Who performed the mutation.
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    // Set on `assigned` (and the birth `created`) events — the technician move.
    fromTechnicianId: uuid('from_technician_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    toTechnicianId: uuid('to_technician_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    changes: jsonb('changes').$type<VisitChanges>().notNull().default({}),
    // Free text: the reason on status_changed / rescheduled events.
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // History reads are always "oldest-first for one visit".
    index('visit_events_visit_idx').on(table.visitId, table.createdAt),
    check(
      'visit_events_type_check',
      sql`${table.type} in ('created', 'updated', 'assigned', 'status_changed', 'rescheduled')`,
    ),
  ],
);

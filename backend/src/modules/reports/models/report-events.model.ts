import { bigserial, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { reports } from './reports.model';
import { users } from '../../users/models/users.model';
import { customerContacts } from '../../customers/models/customer-contacts.model';
import type { ReportEventType } from '../enums/reports.enum';

// The report's own append-only timeline — modelled column-for-column on
// `quotation_events` (01 CP-5 §6d). Append-only: no updates, no deletes, ever.
// That is what makes it evidence rather than a status mirror — the trail shows
// the full history and the sequence is the thing you need when a client
// disputes what was served.
//
// `report_id` is **text**, not uuid — reports are keyed by their `R-YYYYMMDD-NNNN`
// folio, the same reason `service_order_events.refId` is text.
export const reportEvents = pgTable(
  'report_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Insertion order, and the ONLY thing the timeline sorts by. Same reasoning
    // as `quotation_events.seq`: events are batched and must sort by sequence,
    // not by timestamp which can collide.
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    reportId: text('report_id')
      .notNull()
      .references(() => reports.id, { onDelete: 'restrict' }),
    type: text('type').$type<ReportEventType>().notNull(),
    // Attribution splits by origin: staff actions carry `actorId`, portal
    // actions carry `contactId` with `actorId` null. Never both.
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'restrict' }),
    contactId: uuid('contact_id').references(() => customerContacts.id, { onDelete: 'restrict' }),
    // Structured detail per type: the portal flag `{ via: 'portal' }` on downloads.
    changes: jsonb('changes').$type<Record<string, unknown>>(),
    // Free text: event-specific metadata.
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Timeline reads are always "this report, in insertion order".
    index('report_events_report_idx').on(table.reportId, table.seq),
  ],
);

import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../users/models/users.model';
import { serviceOrders } from './service-orders.model';
import type {
  ServiceOrderEventRefKind,
  ServiceOrderEventType,
} from '../enums/service-orders.enum';

// The order timeline (19 §7) — **the single audit aggregate** for a job. Every
// event across the order and its children (lines, reports, and visits from
// CP-3) appends here; there are deliberately no per-child audit tables.
//
// Append-only, mirroring `customer_interactions`: no updates, no deletes, no
// `deleted_at`. The trail IS the record, and at `order_completed` it composes
// the client handoff document (CP-5) — which is precisely why it can't be
// editable after the fact.
//
// Writers append **inside the same transaction** as the state change they
// describe, so the trail can never drift from reality.
//
// Applied directly to the shared Neon DB (ahead-of-migrations rule) — no
// drizzle migration file is generated from here.
export const serviceOrderEvents = pgTable(
  'service_order_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    serviceOrderId: uuid('service_order_id')
      .notNull()
      .references(() => serviceOrders.id, { onDelete: 'restrict' }),
    type: text('type').$type<ServiceOrderEventType>().notNull(),
    // Who did it. Null only for pure-system events with no human actor.
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'restrict' }),
    // Link-out to the child this event concerns. `refId` is text, not uuid:
    // reports are keyed by their `R-YYYYMMDD-NNNN` folio while every other
    // child is a uuid, and one column has to carry both.
    refKind: text('ref_kind').$type<ServiceOrderEventRefKind>(),
    refId: text('ref_id'),
    // Field-level diff for edits and reassignments: { field: { from, to } }.
    changes: jsonb('changes'),
    // Free text — the close reason, the cancellation note, an explosion label.
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Both read shapes — the paged newest-first UI feed and the CP-5 handoff's
    // full oldest-first pass — scan this one index in opposite directions.
    index('service_order_events_order_idx').on(table.serviceOrderId, table.createdAt),
  ],
);

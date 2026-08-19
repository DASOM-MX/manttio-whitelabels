import { bigserial, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { services } from './services.model';
import { users } from '../../users/models/users.model';
import type { ServiceEventType } from '../enums/services.enum';

// The catalog's append-only audit trail (18 §6.1) — the same shape as
// `quotation_events` and `customer_interactions`: no updates, no deletes,
// ever. The catalog is where the money comes from, and before this table a
// price edit was a silent overwrite; now every mutation leaves its row, and
// each row is written INSIDE the transaction that made the change it
// describes, so a mutation without its event is not a reachable state.
//
// Applied directly to the shared Neon DB (ahead-of-migrations rule) — no
// drizzle migration file is generated from here.
export const serviceEvents = pgTable(
  'service_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Insertion order, and the ONLY thing the timeline sorts by — batch rows
    // (a CSV import, one `service_created` per row) share one `now()`, so
    // `created_at` cannot order a trail (quotations CP-1 precedent).
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'restrict' }),
    type: text('type').$type<ServiceEventType>().notNull(),
    // Always a staff user — the catalog has no public actors (18 §6.1), so
    // unlike `quotation_events` there is no nullable actor/contact split.
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    // Structured detail the UI renders per type: `via` on a create, per-field
    // `{ old, new }` on an update. jsonb because the shape is per-type and the
    // timeline is read whole — never queried by key.
    changes: jsonb('changes').$type<Record<string, unknown>>(),
    // Free text: the mandatory delete comment.
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Timeline reads are always "this service, in insertion order".
    index('service_events_service_idx').on(table.serviceId, table.seq),
  ],
);

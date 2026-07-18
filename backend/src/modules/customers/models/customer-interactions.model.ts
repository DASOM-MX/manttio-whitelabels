import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { customers } from './customers.model';
import { users } from '../../users/models/users.model';
import type { InteractionRefKind, InteractionType } from '../enums/interactions.enum';

// Append-only per-customer activity timeline (08 §2). Manual entries carry the
// author (`user_id`); `system` entries are backend-generated on customer
// lifecycle + status changes and link out via `ref_kind`/`ref_id`. No updates
// or deletes in v1 — the timeline IS the relationship history.
export const customerInteractions = pgTable(
  'customer_interactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    type: text('type').$type<InteractionType>().notNull(),
    body: text('body').notNull(),
    // Present only on `system` entries that link out (e.g. a status change).
    refKind: text('ref_kind').$type<InteractionRefKind>(),
    refId: text('ref_id'),
    // The acting user — null only for purely-automated entries with no actor.
    userId: uuid('user_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Timeline reads are always "newest-first for one customer".
    index('customer_interactions_customer_idx').on(table.customerId, table.createdAt),
  ],
);

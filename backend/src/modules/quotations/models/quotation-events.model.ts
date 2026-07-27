import { bigserial, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { quotations } from './quotations.model';
import { users } from '../../users/models/users.model';
import { customerContacts } from '../../customers/models/customer-contacts.model';
import type { QuotationEventRefKind, QuotationEventType } from '../enums/quotations.enum';

// The quotation's own append-only timeline (20 §5) — the PRE-sale record,
// distinct from the order timeline 19 will own (post-sale) and linked to it
// through `quotations.serviceOrderId`.
//
// Append-only in the same sense as `customer_interactions`: no updates, no
// deletes, ever. That is what makes it evidence rather than a status mirror —
// a reviewer who approves, flips to declined, then flips back leaves three
// rows, and the sequence is the thing you need when a client disputes what was
// agreed. Every row is written INSIDE the transaction that made the change it
// describes, so a state change without its event is not a reachable state.
export const quotationEvents = pgTable(
  'quotation_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Insertion order, and the ONLY thing the timeline sorts by. `created_at`
    // cannot do this job: events are written in batches (a quote opens with one
    // `created` plus one `line_added` per line, in a single INSERT), and every
    // row in a batch gets the same `now()` — so ordering by timestamp leaves
    // rows with identical keys in whatever order the planner returns them, and
    // a trail that reports "line added" before "quotation created" is not
    // evidence of anything.
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    quotationId: uuid('quotation_id')
      .notNull()
      .references(() => quotations.id, { onDelete: 'restrict' }),
    type: text('type').$type<QuotationEventType>().notNull(),
    // Attribution splits by origin: staff actions carry `actorId`, token-page
    // actions carry `contactId` with `actorId` null. Never both — "who did
    // this" has exactly one answer, and conflating them would let a client
    // action masquerade as a staff one in the trail.
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'restrict' }),
    contactId: uuid('contact_id').references(() => customerContacts.id, { onDelete: 'restrict' }),
    refKind: text('ref_kind').$type<QuotationEventRefKind>(),
    refId: uuid('ref_id'),
    // Structured detail the UI renders per type: the tally behind a status
    // derive, reviewer-vs-informational on a send, the override flag on a
    // conversion. jsonb because the shape is per-type and the timeline is
    // read whole — never queried by key.
    changes: jsonb('changes').$type<Record<string, unknown>>(),
    // Free text: the mandatory cancel/convert comment, or a decline reason.
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Timeline reads are always "this quote, in insertion order".
    index('quotation_events_quotation_idx').on(table.quotationId, table.seq),
  ],
);

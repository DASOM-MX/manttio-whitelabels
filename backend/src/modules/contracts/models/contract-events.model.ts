import { bigserial, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { contracts } from './contracts.model';
import { users } from '../../users/models/users.model';
import { customerContacts } from '../../customers/models/customer-contacts.model';
import type { ContractEventType } from '../enums/contracts.enum';

// The contract's own append-only timeline — modelled column-for-column on
// `quotation_events` (01 CP-5 §6d). Append-only: no updates, no deletes, ever.
// That is what makes it evidence rather than a status mirror — the trail shows
// the full history and the sequence is the thing you need when a client
// disputes what was served.
export const contractEvents = pgTable(
  'contract_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Insertion order, and the ONLY thing the timeline sorts by. Same reasoning
    // as `quotation_events.seq`: events are batched and must sort by sequence,
    // not by timestamp which can collide.
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id, { onDelete: 'restrict' }),
    type: text('type').$type<ContractEventType>().notNull(),
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
    // Timeline reads are always "this contract, in insertion order".
    index('contract_events_contract_idx').on(table.contractId, table.seq),
  ],
);

import { bigserial, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { serviceRequests } from './service-requests.model';
import { users } from '../../users/models/users.model';
import { portalUsers } from '../../portal/models/portal-users.model';
import type { ServiceRequestEventType } from '../enums/service-requests.enum';

// The service request's own append-only timeline (01 §5) — distinct from the
// quotation timeline (20) that may follow it.
//
// Append-only in the same sense as `customer_interactions`: no updates, no
// deletes, ever. That is what makes it evidence rather than a status mirror —
// a request whose status changes from `submitted` to `in_review` to `needs_info`
// to `in_review` leaves four rows, and the sequence is the thing you need when
// a client disputes what was agreed. Every row is written INSIDE the transaction
// that made the change it describes, so a state change without its event is not
// a reachable state.
export const serviceRequestEvents = pgTable(
  'service_request_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Insertion order, and the ONLY thing the timeline sorts by. `created_at`
    // cannot do this job: events are written in batches (a request opens with one
    // `created` event, in a single INSERT), and every row in a batch gets the
    // same `now()`.
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    serviceRequestId: uuid('service_request_id')
      .notNull()
      .references(() => serviceRequests.id, { onDelete: 'restrict' }),
    type: text('type').$type<ServiceRequestEventType>().notNull(),
    // Attribution splits by origin: staff actions carry `actorId`, portal
    // actions carry `portalUserId` with `actorId` null. Never both — "who did
    // this" has exactly one answer, and conflating them would let a client
    // action masquerade as a staff one in the trail.
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'restrict' }),
    // The portal account, not the contact: only a login can act here, and
    // `portal_users.contact_id` still resolves the address-book entry.
    portalUserId: uuid('portal_user_id').references(() => portalUsers.id, {
      onDelete: 'restrict',
    }),
    // Structured detail the UI renders per type: the specific data that supports
    // the event. jsonb because the shape is per-type and the timeline is read
    // whole — never queried by key.
    changes: jsonb('changes').$type<Record<string, unknown>>(),
    // Free text: the mandatory reject reason, the info question, the client's answer.
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Timeline reads are always "this request, in insertion order".
    index('service_request_events_request_idx').on(table.serviceRequestId, table.seq),
  ],
);

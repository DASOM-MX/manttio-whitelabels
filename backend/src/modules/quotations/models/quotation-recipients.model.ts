import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { quotations } from './quotations.model';
import { customerContacts } from '../../customers/models/customer-contacts.model';
import { QuotationResponse } from '../enums/quotations.enum';

// One row per mailed contact (20 §4) — the token model, borrowed from
// `report_emails`: the URL itself is the secret, so the row IS the grant.
//
// `isReviewer` splits the audience: a reviewer can approve or decline (and
// their reason is recorded against their name), everyone else gets a read-only
// copy. A send with zero reviewers is allowed (owner 2026-07-26) — an
// informational share, which simply leaves the tally with nothing to count.
export const quotationRecipients = pgTable(
  'quotation_recipients',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    quotationId: uuid('quotation_id')
      .notNull()
      .references(() => quotations.id, { onDelete: 'restrict' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => customerContacts.id, { onDelete: 'restrict' }),
    // Snapshot of the address actually mailed, so editing the contact later
    // never rewrites where this quote went.
    email: text('email').notNull(),
    isReviewer: boolean('is_reviewer').notNull().default(false),
    // High-entropy, per-recipient. Stable across re-sends (owner 2026-07-26):
    // rotating it would kill the link already sitting in someone's inbox.
    token: text('token').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
    // First open only — this is a delivery signal, not analytics.
    viewedAt: timestamp('viewed_at', { withTimezone: true }),
    // The LAST response time. Responses are mutable: a reviewer may change
    // their mind while the quote is live, and each change is re-logged as its
    // own `quotation_events` row, so this column is the current answer and the
    // timeline is the history.
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    response: text('response').$type<QuotationResponse>(),
    // Required on decline — "who didn't approve, and why" is the point.
    responseReason: text('response_reason'),
  },
  (table) => [
    uniqueIndex('quotation_recipients_token_uidx').on(table.token),
    index('quotation_recipients_quotation_idx').on(table.quotationId),
    // One row per contact per quote: a re-send updates the existing row (and
    // re-mails the same token) instead of stacking duplicates.
    uniqueIndex('quotation_recipients_contact_uidx').on(table.quotationId, table.contactId),
  ],
);

import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { reports } from './reports.model';
import { users } from '../../users/models/users.model';

// Send log + token-bearer download record. We do NOT track opens — the row is the audit
// trail that we sent the email. Every email contains a download link (no attachments);
// the recipient hits `/reports/download/:token` to fetch the PDF.
export const reportEmails = pgTable(
  'report_emails',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reportId: text('report_id')
      .notNull()
      .references(() => reports.id, { onDelete: 'cascade' }),
    sentBy: uuid('sent_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
    recipientTo: text('recipient_to').notNull(),
    recipientCc: text('recipient_cc').array().notNull().default(sql`'{}'::text[]`),
    accessToken: text('access_token').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    resendMessageId: text('resend_message_id'),
  },
  (table) => [
    uniqueIndex('report_emails_token_idx').on(table.accessToken),
    index('report_emails_report_id_idx').on(table.reportId),
  ],
);

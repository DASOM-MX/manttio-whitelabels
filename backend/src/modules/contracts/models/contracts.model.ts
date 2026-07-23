import { sql } from 'drizzle-orm';
import { date, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { customers } from '../../customers/models/customers.model';
import { users } from '../../users/models/users.model';

// Filed contract documents (13 §1, owner supersession 2026-07-22): a plain
// document CRUD — pdf/word/image stored in the `manttio-contracts` bucket,
// optional client link, validation/expiry dates, searchable tags. Vigencia
// (vigente/por vencer/vencido) is derived client-side from `expiry_date`,
// never stored.
export const contracts = pgTable(
  'contracts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // 0-1 client — a contract can be filed unlinked.
    customerId: uuid('customer_id').references(() => customers.id),
    description: text('description').notNull(),
    // The stored document: CDN URL + display metadata committed from the
    // two-step upload (POST /upload/contract).
    fileUrl: text('file_url').notNull(),
    fileName: text('file_name').notNull(),
    fileMime: text('file_mime').notNull(),
    fileSize: integer('file_size'),
    // Plain 'YYYY-MM-DD' strings (`date` columns).
    validationDate: date('validation_date').notNull(),
    expiryDate: date('expiry_date'),
    // Lowercase + trimmed on write; the GIN index is the search index (spec).
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    // Audit for the rare soft delete (equipment shape).
    deleteComment: text('delete_comment'),
    deletedBy: uuid('deleted_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('contracts_customer_idx')
      .on(table.customerId)
      .where(sql`${table.deletedAt} is null`),
    index('contracts_tags_gin_idx').using('gin', table.tags),
  ],
);

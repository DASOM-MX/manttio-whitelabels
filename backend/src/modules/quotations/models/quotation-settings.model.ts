import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../users/models/users.model';

// Tenant-level quotation defaults (20 CP-3 PR-C). A singleton by convention:
// one row whose id is the literal 'default' — the same shape a second setting
// would extend as a column, not as more rows. Currently just the default
// terms & conditions the builder prefills into a new quote's `comments`.
export const quotationSettings = pgTable('quotation_settings', {
  id: text('id').primaryKey().default('default'),
  defaultComments: text('default_comments').notNull().default(''),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'restrict' }),
});

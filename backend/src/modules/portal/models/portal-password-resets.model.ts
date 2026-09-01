import { pgTable, text, timestamp, uniqueIndex, uuid, index } from 'drizzle-orm/pg-core';
import { portalUsers } from './portal-users.model';

// Backs the self-service half of 00 §3.5.
export const portalPasswordResets = pgTable(
  'portal_password_resets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    portalUserId: uuid('portal_user_id')
      .notNull()
      .references(() => portalUsers.id, { onDelete: 'restrict' }),
    // Hash, never the token. A DB leak must not hand over live reset links.
    tokenHash: text('token_hash').notNull(),
    // TTL 1h.
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    // Single use; a consumed row is kept, not deleted.
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('portal_password_resets_token_hash_uidx').on(table.tokenHash),
    index('portal_password_resets_user_idx').on(table.portalUserId, table.createdAt),
  ],
);

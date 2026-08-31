import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  index,
} from 'drizzle-orm/pg-core';
import { users } from '../../users/models/users.model';
import { portalUsers } from './portal-users.model';
import { PortalGrant } from '../enums/portal-grants.enum';

// One row per (portal user, grant) — 00 §3.6. Rows, not columns, so adding a
// capability is data, not DDL, and each grant carries its own who/when.
export const portalUserGrants = pgTable(
  'portal_user_grants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    portalUserId: uuid('portal_user_id')
      .notNull()
      .references(() => portalUsers.id, { onDelete: 'restrict' }),
    grant: text('grant').$type<PortalGrant>().notNull(),
    grantedBy: uuid('granted_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    // Revoking is a flip, never a DELETE (no-hard-deletes rule). The row stays as
    // the record that access once existed.
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by').references(() => users.id, {
      onDelete: 'restrict',
    }),
  },
  (table) => [
    uniqueIndex('portal_user_grants_active_idx')
      .on(table.portalUserId, table.grant)
      .where(sql`${table.revokedAt} is null`),
    index('portal_user_grants_user_idx').on(table.portalUserId),
  ],
);

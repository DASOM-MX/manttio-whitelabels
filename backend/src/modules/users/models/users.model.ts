import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').$type<'owner' | 'admin' | 'office' | 'technician'>().notNull(),
    // Temp-password model (backend plan §1): set when a temp password is issued
    // (create/reset), cleared by POST /auth/password; clients block entry on it.
    mustChangePassword: boolean('must_change_password').default(false).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deleteComment: text('delete_comment'),
    // Self-reference: the admin who soft-deleted this row. Restrict-on-delete so
    // the deleter can't be erased without breaking the audit trail (matches the
    // reports.createdBy / assignedTo FK posture).
    deletedBy: uuid('deleted_by').references((): AnyPgColumn => users.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Partial unique index: only active rows enforce email uniqueness, so soft-deleted
    // users do not block re-registration of the same email later.
    uniqueIndex('users_email_active_idx')
      .on(table.email)
      .where(sql`${table.deletedAt} is null`),
    check('users_role_check', sql`${table.role} in ('owner', 'admin', 'office', 'technician')`),
  ],
);

import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../users/models/users.model';
import { ROLES } from '../../users/enums/users.enum';
import type { Role } from '../../users/enums/users.enum';
import { NotificationStatus, NotificationType } from '../enums/notifications.enum';

// CHECK value lists are derived from the enums, never hand-copied: adding a
// member widens the constraint and `db:generate` emits the DDL by itself.
const checkValues = (members: readonly string[]) =>
  sql.raw(members.map((m) => `'${m}'`).join(', '));

// Per-user notification copies (notifications plan §1). A role broadcast fans
// out at creation — one row per resolved recipient, so read-state, the badge,
// SSE scoping and retention all stay per-user. The row IS the in-app delivery.
// (The email channel is deferred — owner, 2026-07-20; its `email_status` /
// `email_error` columns land as additive DDL when it is wired.)
//
// Retention exception: notifications are transient delivery copies — leaf rows
// nothing FKs to, not an audit trail (the permanent record of the underlying
// event lives in the originating module's own log). The daily sweep hard-deletes
// rows older than 8 months (plan §0/§2.4) — the one owner-sanctioned departure
// from the fork's no-hard-deletes rule.
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Always concrete — role sends resolve to one row per active user (§2.1).
    recipientUserId: uuid('recipient_user_id')
      .notNull()
      .references(() => users.id),
    // Provenance of a role broadcast; null when addressed directly. Non-functional
    // (grouping/debugging + an optional "para administradores" tag in the panel).
    audienceRole: text('audience_role').$type<Role>(),
    type: text('type').$type<NotificationType>().notNull(),
    // Short, already-localized (Spanish) — the module does no i18n.
    title: text('title').notNull(),
    body: text('body').notNull(),
    // Deep-link payload (e.g. { importId, warehouseId, counts, link }); the
    // frontend builds the router target from this + `type`.
    data: jsonb('data').$type<Record<string, unknown>>().default({}).notNull(),
    status: text('status').$type<NotificationStatus>().notNull().default(NotificationStatus.Unread),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // List + stream cursor: always "newest-first for one recipient".
    index('notifications_recipient_created_idx').on(table.recipientUserId, table.createdAt),
    // Badge count — partial, unread rows only.
    index('notifications_recipient_unread_idx')
      .on(table.recipientUserId)
      .where(sql`${table.status} = 'unread'`),
    // Retention sweep scan.
    index('notifications_created_idx').on(table.createdAt),
    check(
      'notifications_type_check',
      sql`${table.type} in (${checkValues(Object.values(NotificationType))})`,
    ),
    check(
      'notifications_status_check',
      sql`${table.status} in (${checkValues(Object.values(NotificationStatus))})`,
    ),
    check(
      'notifications_audience_role_check',
      sql`${table.audienceRole} in (${checkValues(ROLES)})`,
    ),
  ],
);

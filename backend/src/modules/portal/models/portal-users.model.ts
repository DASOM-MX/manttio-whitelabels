import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { customers } from '../../customers/models/customers.model';
import { customerContacts } from '../../customers/models/customer-contacts.model';
import { users } from '../../users/models/users.model';
import { PortalUserStatus } from '../enums/portal-users.enum';

// A login for exactly one customer contact (00 §3.3). Credentials never touch
// customer_contacts — a contact is an address-book entry, and most contacts never
// get access. portal_users is 1:1 with a customer_contacts row (A10) among active
// rows.
export const portalUsers = pgTable(
  'portal_users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // 1:1 with a customer_contacts row; enforce uniqueness on active rows only
    // (A10). A revoked account never blocks a re-invite of the same contact.
    contactId: uuid('contact_id')
      .notNull()
      .references(() => customerContacts.id, { onDelete: 'restrict' }),
    // Denormalized from the contact: it is the token claim and the scope of every
    // read. Written at invite, never updated — a contact does not move between
    // customers.
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    // Login identity. Seeded from the contact at invite; independent afterwards
    // (editing a contact's address must not silently change a credential). Partial
    // unique on active rows: a revoked account never blocks a re-invite (A16).
    email: text('email').notNull(),
    // Same password.service.ts as staff users.
    passwordHash: text('password_hash').notNull(),
    // Temp-password model, mirrors users.
    mustChangePassword: boolean('must_change_password').notNull().default(true),
    // Workflow: invited → active on first successful password change; suspended =
    // staff revoked access without deleting.
    status: text('status')
      .$type<PortalUserStatus>()
      .notNull()
      .default(PortalUserStatus.Invited),
    // A6 / 00 §4b.17: the customer's own administrator. Confers exactly one power
    // today: closing a service request (§4). Not a grant row — grants say what you
    // may do with records, this says who speaks for the customer. Set at invite and
    // editable in superadmin 26.
    isAdmin: boolean('is_admin').notNull().default(false),
    // A3: 5 failed logins → 2-hour cooldown on the account. Applies to the portal
    // login route.
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    // Set to now() + 2h when failed_login_attempts reaches 5; login refuses while
    // it is in the future (00 §4b.19). State lives here, not in memory — a Worker
    // isolate has none to share.
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    // Shown in superadmin 26 so staff can see whether an invite was ever used.
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    // The staff member who granted access.
    invitedBy: uuid('invited_by').references(() => users.id, {
      onDelete: 'restrict',
    }),
    // Soft delete + audit, exactly the users posture. No hard delete path.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deleteComment: text('delete_comment'),
    deletedBy: uuid('deleted_by').references((): AnyPgColumn => users.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // The uniqueness rule (A10): one account per customer contact. A revoked
    // account never blocks a re-invite of the same contact.
    uniqueIndex('portal_users_contact_active_idx')
      .on(table.contactId)
      .where(sql`${table.deletedAt} is null`),
    // Partial-unique posture as users_email_active_idx, so a revoked account
    // never blocks a re-invite. A16 makes this sound: contacts are unique per
    // email, so one address maps to one account and the login lookup returns one
    // row.
    uniqueIndex('portal_users_email_active_idx')
      .on(table.email)
      .where(sql`${table.deletedAt} is null`),
    index('portal_users_customer_idx').on(table.customerId),
  ],
);

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
    // No FK: updateCustomerWithRelations deletes and re-inserts all contacts per
    // PATCH; a restrict FK would break customer edits the moment a contact has a
    // portal user. A portal user is created from a contact and is standalone
    // thereafter — staff administer portal accounts without touching the contacts
    // list. The pointer can go stale if the customer's contacts are later replaced;
    // this is accepted (owner 2026-08-31). The email column, independent since
    // invite, is the live identity.
    contactId: uuid('contact_id').notNull(),
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
    // Personal name, mirrors the users table for consistency across staff and portal
    // user lists. Seeded from the customer_contacts row at invite but becomes independent
    // thereafter — editing a contact's details does not change the portal user's name.
    name: text('name').notNull(),
    // Mexican two-surname convention: mirrors users.paternalLastName / users.maternalLastName
    // (owner ask, 2026-07-21) so superadmin lists can render staff and portal users
    // with the same name format. Nullable because this field is free input at invite time.
    paternalLastName: text('paternal_last_name'),
    maternalLastName: text('maternal_last_name'),
    // Job title from the customer's own organisation (e.g. "Gerente de mantenimiento",
    // "Jefe de planta"), not a permission. Free text and deliberately unconstrained —
    // is_admin (below) is the actual capability. This is an exception to the module's
    // usual real-TS-enum rule (which applies to statuses, types, and capabilities);
    // role here is descriptive data only and must stay flexible to customer
    // organisational structures. Seeded from customer_contacts but independent thereafter.
    // NOT the same kind of column as `users.role`, despite the shared name and the
    // "mirrors users" note above: that one is a $type'd permission enum with a CHECK.
    // The parallel here is `customer_contacts.role`, which is bare nullable text too.
    role: text('role'),
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

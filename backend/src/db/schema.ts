import { relations, sql } from 'drizzle-orm';
import {
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').$type<'admin' | 'technician'>().notNull(),
    timezone: text('timezone').notNull().default('America/Mexico_City'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Partial unique index: only active rows enforce email uniqueness, so soft-deleted
    // users do not block re-registration of the same email later.
    uniqueIndex('users_email_active_idx')
      .on(table.email)
      .where(sql`${table.deletedAt} is null`),
    check('users_role_check', sql`${table.role} in ('admin', 'technician')`),
  ],
);

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    identification: text('identification'),
    phone: text('phone'),
    email: text('email'),
    observation: text('observation'),
    address: text('address'),
    state: text('state'),
    razonSocial: text('razon_social'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('customers_email_idx').on(table.email)],
);

export const reports = pgTable(
  'reports',
  {
    id: text('id').primaryKey(),
    reportType: text('report_type').notNull(),
    workType: text('work_type'),
    dateArrival: timestamp('date_arrival', { withTimezone: true }),
    dateDeparture: timestamp('date_departure', { withTimezone: true }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    assignedTo: uuid('assigned_to')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    signedBy: text('signed_by'),
    status: text('status')
      .$type<'created' | 'in-progress' | 'finished' | 'mailed'>()
      .notNull()
      .default('created'),
    state: text('state'),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    signedLatitude: doublePrecision('signed_latitude'),
    signedLongitude: doublePrecision('signed_longitude'),
    signedAccuracy: doublePrecision('signed_accuracy'),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    mailedAt: timestamp('mailed_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('reports_created_by_idx').on(table.createdBy),
    index('reports_assigned_to_idx').on(table.assignedTo),
    index('reports_client_id_idx').on(table.clientId),
    index('reports_report_type_idx').on(table.reportType),
    index('reports_status_idx').on(table.status),
    index('reports_assigned_status_idx').on(table.assignedTo, table.status),
    index('reports_state_idx').on(table.state),
    check(
      'reports_status_check',
      sql`${table.status} in ('created', 'in-progress', 'finished', 'mailed')`,
    ),
  ],
);

export const reportDetails = pgTable('report_details', {
  reportId: text('report_id')
    .primaryKey()
    .references(() => reports.id, { onDelete: 'cascade' }),
  data: jsonb('data').notNull(),
  pictures: text('pictures').array().notNull().default(sql`'{}'::text[]`),
  signature: text('signature'),
  contentFilledAt: timestamp('content_filled_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const reportCounters = pgTable('report_counters', {
  day: date('day').primaryKey(),
  lastNumber: integer('last_number').notNull(),
});

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

export const usersRelations = relations(users, ({ many }) => ({
  reportsCreated: many(reports, { relationName: 'reports_created_by' }),
  reportsAssigned: many(reports, { relationName: 'reports_assigned_to' }),
  emailsSent: many(reportEmails),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  reports: many(reports),
}));

export const reportsRelations = relations(reports, ({ one, many }) => ({
  creator: one(users, {
    fields: [reports.createdBy],
    references: [users.id],
    relationName: 'reports_created_by',
  }),
  assignee: one(users, {
    fields: [reports.assignedTo],
    references: [users.id],
    relationName: 'reports_assigned_to',
  }),
  client: one(customers, {
    fields: [reports.clientId],
    references: [customers.id],
  }),
  details: one(reportDetails),
  emails: many(reportEmails),
}));

export const reportDetailsRelations = relations(reportDetails, ({ one }) => ({
  report: one(reports, {
    fields: [reportDetails.reportId],
    references: [reports.id],
  }),
}));

export const reportEmailsRelations = relations(reportEmails, ({ one }) => ({
  report: one(reports, {
    fields: [reportEmails.reportId],
    references: [reports.id],
  }),
  sender: one(users, {
    fields: [reportEmails.sentBy],
    references: [users.id],
  }),
}));

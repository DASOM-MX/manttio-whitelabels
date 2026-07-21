import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { CustomerSource, CustomerStatus, type ClientType } from '../enums/customers.enum';

// NOTE: the shared Neon DB already carries `contact_name`, `status`, `source`
// and `tags` (added out-of-band by the manager/upstream) — this model just
// catches up so the API reads/writes them. `tags` is a Postgres text[].
// Migration 0019 adds only the columns the live DB lacks (client_type,
// status_changed_at, attribution) plus the indexes/checks.
export const customers = pgTable(
  'customers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    // Primary contact person's name (superadmin "Contacto"); the customer's own
    // `phone`/`email` double as that contact's channels.
    contactName: text('contact_name'),
    identification: text('identification'),
    phone: text('phone'),
    email: text('email'),
    observation: text('observation'),
    address: text('address'),
    state: text('state'),
    razonSocial: text('razon_social'),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    status: text('status').$type<CustomerStatus>().notNull().default(CustomerStatus.Active),
    source: text('source').$type<CustomerSource>().notNull().default(CustomerSource.Other),
    // CRM (08): the blacklist reason (set via POST /:id/status) and the single
    // follow-up date (08 §3). Both already live in the shared DB.
    blacklistReason: text('blacklist_reason'),
    nextFollowUpAt: timestamp('next_follow_up_at', { withTimezone: true }),
    timezone: text('timezone').notNull().default('America/Mexico_City'),
    clientType: text('client_type').$type<ClientType>(),
    // NULL at birth status; readers coalesce to created_at.
    statusChangedAt: timestamp('status_changed_at', { withTimezone: true }),
    // Attribution columns are write-once: set only by the public lead insert,
    // omitted from every update path (types/validators/service enforce it).
    utmSource: text('utm_source'),
    utmMedium: text('utm_medium'),
    utmCampaign: text('utm_campaign'),
    utmTerm: text('utm_term'),
    utmContent: text('utm_content'),
    gclid: text('gclid'),
    fbclid: text('fbclid'),
    referrer: text('referrer'),
    landingPage: text('landing_page'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('customers_email_idx').on(table.email),
    index('customers_active_idx')
      .on(table.createdAt)
      .where(sql`${table.deletedAt} is null`),
    index('customers_utm_source_idx')
      .on(table.utmSource)
      .where(sql`${table.utmSource} is not null`),
    index('customers_utm_campaign_idx')
      .on(table.utmCampaign)
      .where(sql`${table.utmCampaign} is not null`),
    index('customers_status_idx')
      .on(table.status)
      .where(sql`${table.deletedAt} is null`),
    index('customers_source_idx')
      .on(table.source)
      .where(sql`${table.deletedAt} is null`),
    index('customers_client_type_idx')
      .on(table.clientType)
      .where(sql`${table.deletedAt} is null`),
    // Intake-stats range scans (utm-params 03, perf revision 2026-07-21): the
    // dashboard filters on coalesce(status_changed_at, created_at) over live
    // lead/active rows — applied to the live DB out-of-band 2026-07-21.
    index('customers_intake_effective_idx')
      .on(sql`(coalesce(${table.statusChangedAt}, ${table.createdAt}))`)
      .where(sql`${table.deletedAt} is null and ${table.status} in ('lead', 'active')`),
    check(
      'customers_status_check',
      sql`${table.status} in ('active', 'lead', 'disabled', 'blacklisted')`,
    ),
    check(
      'customers_source_check',
      sql`${table.source} in ('facebook', 'google', 'referral', 'website', 'phonecall', 'personal_meeting', 'other', 'instagram', 'tiktok', 'whatsapp')`,
    ),
    check('customers_client_type_check', sql`${table.clientType} in ('person', 'business')`),
  ],
);

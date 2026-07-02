import { sql } from 'drizzle-orm';
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
  uuid,
} from 'drizzle-orm/pg-core';
import type { WorkType } from '../../../validators/reports';
import { users } from '../../users/models/users.model';
import { customers } from '../../customers/models/customers.model';

export const reports = pgTable(
  'reports',
  {
    id: text('id').primaryKey(),
    reportType: text('report_type').notNull(),
    workType: text('work_type').$type<WorkType | null>(),
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
    // Keep these literals in sync with `workTypes` in validators/reports.ts.
    check(
      'reports_work_type_check',
      sql`${table.workType} is null or ${table.workType} in ('Preventivo', 'Correctivo', 'Instalación')`,
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

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
import { ReportStatus, type WorkType } from '../enums/reports.enum';
import { users } from '../../users/models/users.model';
import { customers } from '../../customers/models/customers.model';
import { services } from '../../services/models/services.model';
import { serviceOrders } from '../../service-orders/models/service-orders.model';

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
    // The order this report fulfills, and which of its lines (19 §1). **Both
    // nullable by design** — reporting is a standalone sellable suite, so a
    // report never requires an order (06 standalone-suite rule). The explosion
    // writes them; the manual report path leaves them null and works unchanged.
    serviceOrderId: uuid('service_order_id').references(() => serviceOrders.id, {
      onDelete: 'restrict',
    }),
    // Drives the fill-time template prefilter (06 §5, CP-4).
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'restrict' }),
    signedBy: text('signed_by'),
    status: text('status')
      .$type<ReportStatus>()
      .notNull()
      .default(ReportStatus.Created),
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
    // Exploded reports are always read per-order; the partial predicate keeps
    // the index off the millions of standalone reports that have no order.
    index('reports_service_order_idx')
      .on(table.serviceOrderId)
      .where(sql`${table.serviceOrderId} is not null`),
    // Widened for the two order-driven states (19 §1): `pending` is the
    // exploded not-yet-started birth state, `cancelled` the voided-with-its-
    // order end state. Keep in sync with `ReportStatus`.
    check(
      'reports_status_check',
      sql`${table.status} in ('pending', 'created', 'in-progress', 'finished', 'mailed', 'cancelled')`,
    ),
    // Keep these literals in sync with `workTypes` in enums/reports.enum.ts.
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

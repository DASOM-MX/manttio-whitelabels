import { index, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { quotations } from './quotations.model';
import { services } from '../../services/models/services.model';
import { ServiceTaxRate, ServiceUom } from '../../services/enums/services.enum';

// A FROZEN catalog snapshot (20 §1, the snapshot rule). The quote never
// re-reads `services` after creation: editing a price, renaming a service or
// soft-deleting it entirely leaves every existing quote rendering exactly what
// the client was quoted. When 19 converts the quote, the ORDER lines inherit
// these same snapshots — so the order, and eventually the invoice, charges what
// the client actually accepted.
//
// `serviceId` is kept alongside the snapshot for traceability (which catalog
// row this came from) and is `restrict` — never cascade, or deleting a service
// would erase the commercial history that justifies it.
export const quotationLines = pgTable(
  'quotation_lines',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    quotationId: uuid('quotation_id')
      .notNull()
      .references(() => quotations.id, { onDelete: 'restrict' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'restrict' }),
    // --- snapshots, all resolved server-side at creation ---
    serviceName: text('service_name').notNull(),
    // The catalog `description`, or a per-line override the builder typed.
    description: text('description'),
    unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
    uom: text('uom').$type<ServiceUom>().notNull(),
    taxRate: text('tax_rate').$type<ServiceTaxRate>().notNull(),
    quantity: integer('quantity').notNull(),
    // `lineSubtotal` is deliberately NOT stored — it is `unitPrice × quantity`,
    // and a stored copy is a second source of truth that drifts.
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('quotation_lines_quotation_idx').on(table.quotationId),
    index('quotation_lines_service_idx').on(table.serviceId),
  ],
);

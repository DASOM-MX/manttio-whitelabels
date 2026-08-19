import { index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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
// would erase the commercial history that justifies it. NULL = an
// **off-catalog line** (decided 2026-07-29): a one-off concept the staff typed
// in full — name/price/uom/taxRate arrive from the builder instead of the
// catalog, and there is no catalog row to trace back to.
export const quotationLines = pgTable(
  'quotation_lines',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    quotationId: uuid('quotation_id')
      .notNull()
      .references(() => quotations.id, { onDelete: 'restrict' }),
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'restrict' }),
    // --- snapshots: resolved server-side for catalog lines, staff-supplied
    // --- for off-catalog ones. Frozen either way.
    serviceName: text('service_name').notNull(),
    // The catalog `description`, or a per-line override the builder typed.
    description: text('description'),
    unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
    uom: text('uom').$type<ServiceUom>().notNull(),
    taxRate: text('tax_rate').$type<ServiceTaxRate>().notNull(),
    // Decimal quantities (decided 2026-07-29): 1.5 h, 12.75 m². Three decimals,
    // a string end-to-end like every money field — arithmetic parses it once
    // into integer thousandths (see `quotation-totals.ts`).
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
    // Per-line discount as a frozen **amount** (decided 2026-07-29) — CFDI's
    // per-concepto `Descuento` is an amount, and freezing the amount (the % is
    // only a builder-side helper) means no percent re-rounding can ever make
    // the quote and the invoice disagree. Never above the line's importe
    // (service-layer guard).
    discountAmount: numeric('discount_amount', { precision: 12, scale: 2 })
      .notNull()
      .default('0.00'),
    // `lineSubtotal` is deliberately NOT stored — it is `unitPrice × quantity`,
    // and a stored copy is a second source of truth that drifts.
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('quotation_lines_quotation_idx').on(table.quotationId),
    index('quotation_lines_service_idx').on(table.serviceId),
  ],
);

import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { customers } from './customers.model';

// CFDI 4.0 billing data — optional, one row per customer (PK = customer_id).
// Not every customer has fiscal data; the row exists only when billing is set up.
export const customerFiscal = pgTable('customer_fiscal', {
  customerId: uuid('customer_id')
    .primaryKey()
    .references(() => customers.id),
  rfc: text('rfc').notNull(),
  legalName: text('legal_name').notNull(),
  taxRegimeCode: text('tax_regime_code').notNull(),
  fiscalZip: text('fiscal_zip').notNull(),
  cfdiUseCode: text('cfdi_use_code').notNull(),
  billingEmail: text('billing_email'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

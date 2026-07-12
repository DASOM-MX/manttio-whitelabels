import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { customers } from './customers.model';

// CFDI 4.0 fiscal basics for invoicing (plan 07 §1). 1:1 with the customer —
// the row exists only when the client has fiscal data (all-or-nothing enforced
// in the validator). customer_id is the PK so there can be at most one.
export const customerFiscal = pgTable('customer_fiscal', {
  customerId: uuid('customer_id')
    .primaryKey()
    .references(() => customers.id, { onDelete: 'cascade' }),
  rfc: text('rfc').notNull(), // 12 (moral) / 13 (física) chars, uppercase
  legalName: text('legal_name').notNull(), // razón social, no régimen suffix
  taxRegimeCode: text('tax_regime_code').notNull(), // SAT c_RegimenFiscal
  fiscalZip: text('fiscal_zip').notNull(), // CP domicilio fiscal, 5 digits
  cfdiUseCode: text('cfdi_use_code').notNull(), // SAT c_UsoCFDI
  billingEmail: text('billing_email'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

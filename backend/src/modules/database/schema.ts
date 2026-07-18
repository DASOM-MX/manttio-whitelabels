// Schema barrel. Drizzle Kit (drizzle.config.ts) and the DB client both read the schema
// from this single entry point.
//
// Tables live in each module's `models/*.model.ts`. All cross-module `relations()` are
// defined HERE (not in the model files) so the models stay acyclic — relations are
// inherently cyclic (users <-> reports <-> customers <-> emails).
import { relations } from 'drizzle-orm';
import { users } from '../users/models/users.model';
import { customers } from '../customers/models/customers.model';
import { customerContacts } from '../customers/models/customer-contacts.model';
import { customerFiscal } from '../customers/models/customer-fiscal.model';
import { customerInteractions } from '../customers/models/customer-interactions.model';
import { reports, reportDetails, reportCounters } from '../reports/models/reports.model';
import { reportEmails } from '../reports/models/report-emails.model';

export { users } from '../users/models/users.model';
export { customers } from '../customers/models/customers.model';
export { customerContacts } from '../customers/models/customer-contacts.model';
export { customerFiscal } from '../customers/models/customer-fiscal.model';
export { customerInteractions } from '../customers/models/customer-interactions.model';
export { reports, reportDetails, reportCounters } from '../reports/models/reports.model';
export { reportEmails } from '../reports/models/report-emails.model';
export { cmsDocuments, cmsClients } from '../cms/models/cms.model';
export { reportTemplates } from '../report-templates/models/report-templates.model';
export { brand } from '../brand/models/brand.model';

export const usersRelations = relations(users, ({ many }) => ({
  reportsCreated: many(reports, { relationName: 'reports_created_by' }),
  reportsAssigned: many(reports, { relationName: 'reports_assigned_to' }),
  emailsSent: many(reportEmails),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  reports: many(reports),
  contacts: many(customerContacts),
  fiscal: one(customerFiscal),
  interactions: many(customerInteractions),
}));

export const customerContactsRelations = relations(customerContacts, ({ one }) => ({
  customer: one(customers, {
    fields: [customerContacts.customerId],
    references: [customers.id],
  }),
}));

export const customerInteractionsRelations = relations(customerInteractions, ({ one }) => ({
  customer: one(customers, {
    fields: [customerInteractions.customerId],
    references: [customers.id],
  }),
  author: one(users, {
    fields: [customerInteractions.userId],
    references: [users.id],
  }),
}));

export const customerFiscalRelations = relations(customerFiscal, ({ one }) => ({
  customer: one(customers, {
    fields: [customerFiscal.customerId],
    references: [customers.id],
  }),
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

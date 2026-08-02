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
import { equipment, equipmentReports } from '../equipment/models/equipment.model';
import { notifications } from '../notifications/models/notifications.model';
import { scheduledVisits, visitEquipment } from '../visits/models/visits.model';
import { services } from '../services/models/services.model';
import { serviceEvents } from '../services/models/service-events.model';
import { quotations } from '../quotations/models/quotations.model';
import { quotationLines } from '../quotations/models/quotation-lines.model';
import { quotationRecipients } from '../quotations/models/quotation-recipients.model';
import { quotationEvents } from '../quotations/models/quotation-events.model';
import { serviceOrderServices, serviceOrders } from '../service-orders/models/service-orders.model';
import { serviceOrderEvents } from '../service-orders/models/service-order-events.model';

export { users } from '../users/models/users.model';
export { customers } from '../customers/models/customers.model';
export { customerContacts } from '../customers/models/customer-contacts.model';
export { customerFiscal } from '../customers/models/customer-fiscal.model';
export { customerInteractions } from '../customers/models/customer-interactions.model';
export { reports, reportDetails, reportCounters } from '../reports/models/reports.model';
export { reportEmails } from '../reports/models/report-emails.model';
export { equipment, equipmentReports } from '../equipment/models/equipment.model';
export { cmsDocuments, cmsClients } from '../cms/models/cms.model';
export { reportTemplates } from '../report-templates/models/report-templates.model';
export { brand } from '../brand/models/brand.model';
export { notifications } from '../notifications/models/notifications.model';
export { services } from '../services/models/services.model';
export { serviceEvents } from '../services/models/service-events.model';
export { quotations, quotationCounters } from '../quotations/models/quotations.model';
export { quotationSettings } from '../quotations/models/quotation-settings.model';
export { quotationLines } from '../quotations/models/quotation-lines.model';
export { quotationRecipients } from '../quotations/models/quotation-recipients.model';
export { quotationEvents } from '../quotations/models/quotation-events.model';
export { scheduledVisits, visitCounters, visitEquipment } from '../visits/models/visits.model';
export {
  serviceOrders,
  serviceOrderServices,
  serviceOrderCounters,
} from '../service-orders/models/service-orders.model';
export { serviceOrderEvents } from '../service-orders/models/service-order-events.model';

export const usersRelations = relations(users, ({ many }) => ({
  reportsCreated: many(reports, { relationName: 'reports_created_by' }),
  reportsAssigned: many(reports, { relationName: 'reports_assigned_to' }),
  emailsSent: many(reportEmails),
  notifications: many(notifications),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  recipient: one(users, {
    fields: [notifications.recipientUserId],
    references: [users.id],
  }),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  reports: many(reports),
  contacts: many(customerContacts),
  fiscal: one(customerFiscal),
  interactions: many(customerInteractions),
  equipment: many(equipment),
  serviceOrders: many(serviceOrders),
  visits: many(scheduledVisits),
}));

export const serviceOrdersRelations = relations(serviceOrders, ({ one, many }) => ({
  customer: one(customers, {
    fields: [serviceOrders.customerId],
    references: [customers.id],
  }),
  // Null for directly-created orders — both birth routes allowed (19 §1).
  quotation: one(quotations, {
    fields: [serviceOrders.quotationId],
    references: [quotations.id],
  }),
  creator: one(users, {
    fields: [serviceOrders.createdBy],
    references: [users.id],
  }),
  lines: many(serviceOrderServices),
  // Exploded at creation, one per sold unit (19 §2).
  reports: many(reports),
  // The order timeline — the single audit aggregate for the job (19 §7).
  events: many(serviceOrderEvents),
}));

export const serviceOrderServicesRelations = relations(serviceOrderServices, ({ one }) => ({
  order: one(serviceOrders, {
    fields: [serviceOrderServices.serviceOrderId],
    references: [serviceOrders.id],
  }),
  // The catalog row the line was snapshotted from. Present for provenance only:
  // every displayed value comes from the line's own frozen columns, never from
  // following this FK (19 §1).
  service: one(services, {
    fields: [serviceOrderServices.serviceId],
    references: [services.id],
  }),
}));

export const serviceOrderEventsRelations = relations(serviceOrderEvents, ({ one }) => ({
  order: one(serviceOrders, {
    fields: [serviceOrderEvents.serviceOrderId],
    references: [serviceOrders.id],
  }),
  actor: one(users, {
    fields: [serviceOrderEvents.actorId],
    references: [users.id],
  }),
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
  // Both null for a standalone report — reporting never requires an order
  // (06 standalone-suite rule).
  serviceOrder: one(serviceOrders, {
    fields: [reports.serviceOrderId],
    references: [serviceOrders.id],
  }),
  service: one(services, {
    fields: [reports.serviceId],
    references: [services.id],
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

export const equipmentRelations = relations(equipment, ({ one, many }) => ({
  customer: one(customers, {
    fields: [equipment.customerId],
    references: [customers.id],
  }),
  reports: many(equipmentReports),
}));

export const equipmentReportsRelations = relations(equipmentReports, ({ one }) => ({
  equipment: one(equipment, {
    fields: [equipmentReports.equipmentId],
    references: [equipment.id],
  }),
  report: one(reports, {
    fields: [equipmentReports.reportId],
    references: [reports.id],
  }),
}));

// Services catalog (18). The audit trail (§6.1) hangs off the catalog row the
// same way quotation events hang off their quote.
export const servicesRelations = relations(services, ({ many }) => ({
  lines: many(quotationLines),
  events: many(serviceEvents),
}));

export const serviceEventsRelations = relations(serviceEvents, ({ one }) => ({
  service: one(services, {
    fields: [serviceEvents.serviceId],
    references: [services.id],
  }),
  actor: one(users, {
    fields: [serviceEvents.actorId],
    references: [users.id],
  }),
}));

// Quotations (20). `supersedes` is the revision chain — self-referential, which
// is exactly why these relations live here and not in the model file.
export const quotationsRelations = relations(quotations, ({ one, many }) => ({
  customer: one(customers, {
    fields: [quotations.customerId],
    references: [customers.id],
  }),
  author: one(users, {
    fields: [quotations.createdBy],
    references: [users.id],
  }),
  supersedes: one(quotations, {
    fields: [quotations.supersedesQuotationId],
    references: [quotations.id],
    relationName: 'quotation_revision_chain',
  }),
  lines: many(quotationLines),
  recipients: many(quotationRecipients),
  events: many(quotationEvents),
  // The order this quote became (20 §6) — set once, when the quote flips to
  // `order_created`.
  serviceOrder: one(serviceOrders, {
    fields: [quotations.serviceOrderId],
    references: [serviceOrders.id],
  }),
}));

export const quotationLinesRelations = relations(quotationLines, ({ one }) => ({
  quotation: one(quotations, {
    fields: [quotationLines.quotationId],
    references: [quotations.id],
  }),
  // The catalog row the line was snapshotted from — traceability only. The
  // line never re-reads it (20 §1, the snapshot rule).
  service: one(services, {
    fields: [quotationLines.serviceId],
    references: [services.id],
  }),
}));

export const quotationRecipientsRelations = relations(quotationRecipients, ({ one }) => ({
  quotation: one(quotations, {
    fields: [quotationRecipients.quotationId],
    references: [quotations.id],
  }),
  contact: one(customerContacts, {
    fields: [quotationRecipients.contactId],
    references: [customerContacts.id],
  }),
}));

export const quotationEventsRelations = relations(quotationEvents, ({ one }) => ({
  quotation: one(quotations, {
    fields: [quotationEvents.quotationId],
    references: [quotations.id],
  }),
  actor: one(users, {
    fields: [quotationEvents.actorId],
    references: [users.id],
  }),
  contact: one(customerContacts, {
    fields: [quotationEvents.contactId],
    references: [customerContacts.id],
  }),
}));

export const scheduledVisitsRelations = relations(scheduledVisits, ({ one, many }) => ({
  customer: one(customers, {
    fields: [scheduledVisits.customerId],
    references: [customers.id],
  }),
  serviceOrder: one(serviceOrders, {
    fields: [scheduledVisits.serviceOrderId],
    references: [serviceOrders.id],
  }),
  // Two FKs land on `users`, so both need an explicit relationName — otherwise
  // Drizzle can't tell the assignee from the author.
  technician: one(users, {
    fields: [scheduledVisits.technicianId],
    references: [users.id],
    relationName: 'visits_technician',
  }),
  creator: one(users, {
    fields: [scheduledVisits.createdBy],
    references: [users.id],
    relationName: 'visits_created_by',
  }),
  report: one(reports, {
    fields: [scheduledVisits.reportId],
    references: [reports.id],
  }),
  // The reschedule chain, self-referential: `predecessor` is the closed visit
  // this one replaces.
  predecessor: one(scheduledVisits, {
    fields: [scheduledVisits.rescheduledFromId],
    references: [scheduledVisits.id],
    relationName: 'visit_reschedule_chain',
  }),
  equipment: many(visitEquipment),
}));

export const visitEquipmentRelations = relations(visitEquipment, ({ one }) => ({
  visit: one(scheduledVisits, {
    fields: [visitEquipment.visitId],
    references: [scheduledVisits.id],
  }),
  equipment: one(equipment, {
    fields: [visitEquipment.equipmentId],
    references: [equipment.id],
  }),
}));

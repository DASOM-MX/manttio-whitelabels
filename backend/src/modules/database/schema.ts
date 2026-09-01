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
import { reportEvents } from '../reports/models/report-events.model';
import { equipment, equipmentReports } from '../equipment/models/equipment.model';
import {
  contracts,
  contractCounters,
  contractEquipment,
} from '../contracts/models/contracts.model';
import { contractEvents } from '../contracts/models/contract-events.model';
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
import { warehouses } from '../wms/models/warehouses.model';
import { storageNodes } from '../wms/models/storage-nodes.model';
import { materials } from '../wms/models/materials.model';
import { materialUnits } from '../wms/models/material-units.model';
import { materialLots } from '../wms/models/material-lots.model';
import { stockEntries } from '../wms/models/stock-entries.model';
import { movementReasonDefs } from '../wms/models/movement-reason-defs.model';
import { movements, movementUnits } from '../wms/models/movements.model';
import {
  replenishmentImportEvents,
  replenishmentImportRows,
  replenishmentImports,
} from '../wms/models/replenishment-imports.model';
import { replenishmentItems, replenishments } from '../wms/models/replenishments.model';
import { stockCountLines, stockCountSessions } from '../wms/models/stock-count.model';
import { reportMaterials } from '../wms/models/report-materials.model';
import { portalUsers } from '../portal/models/portal-users.model';
import { portalUserGrants } from '../portal/models/portal-user-grants.model';
import { portalPasswordResets } from '../portal/models/portal-password-resets.model';
import {
  serviceRequests,
  serviceRequestCounters,
} from '../service-requests/models/service-requests.model';
import { serviceRequestEvents } from '../service-requests/models/service-request-events.model';

export { users } from '../users/models/users.model';
export { customers } from '../customers/models/customers.model';
export { customerContacts } from '../customers/models/customer-contacts.model';
export { customerFiscal } from '../customers/models/customer-fiscal.model';
export { customerInteractions } from '../customers/models/customer-interactions.model';
export { reports, reportDetails, reportCounters } from '../reports/models/reports.model';
export { reportEmails } from '../reports/models/report-emails.model';
export { reportEvents } from '../reports/models/report-events.model';
export { equipment, equipmentReports } from '../equipment/models/equipment.model';
export { contracts, contractCounters, contractEquipment } from '../contracts/models/contracts.model';
export { contractEvents } from '../contracts/models/contract-events.model';
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
export { warehouses } from '../wms/models/warehouses.model';
export { storageNodes } from '../wms/models/storage-nodes.model';
export { materials } from '../wms/models/materials.model';
export { materialUnits } from '../wms/models/material-units.model';
export { materialLots } from '../wms/models/material-lots.model';
export { stockEntries } from '../wms/models/stock-entries.model';
export { movementReasonDefs } from '../wms/models/movement-reason-defs.model';
export { movements, movementUnits } from '../wms/models/movements.model';
export {
  replenishmentImports,
  replenishmentImportRows,
  replenishmentImportEvents,
} from '../wms/models/replenishment-imports.model';
export {
  replenishments,
  replenishmentItems,
  wmsCounters,
} from '../wms/models/replenishments.model';
export { stockCountSessions, stockCountLines } from '../wms/models/stock-count.model';
export { reportMaterials } from '../wms/models/report-materials.model';
export { wmsSettings } from '../wms/models/wms-settings.model';
export { portalUsers } from '../portal/models/portal-users.model';
export { portalUserGrants } from '../portal/models/portal-user-grants.model';
export { portalPasswordResets } from '../portal/models/portal-password-resets.model';
export {
  serviceRequests,
  serviceRequestCounters,
} from '../service-requests/models/service-requests.model';
export { serviceRequestEvents } from '../service-requests/models/service-request-events.model';

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
  contracts: many(contracts),
}));

export const serviceOrdersRelations = relations(serviceOrders, ({ one, many }) => ({
  customer: one(customers, {
    fields: [serviceOrders.customerId],
    references: [customers.id],
  }),
  // The inverse of `quotationsRelations.serviceOrder` — the link column lives
  // on `quotations` alone. Null for directly-created orders (19 §1).
  quotation: one(quotations),
  creator: one(users, {
    fields: [serviceOrders.createdBy],
    references: [users.id],
  }),
  lines: many(serviceOrderServices),
  // Exploded at creation, one per sold unit (19 §2).
  reports: many(reports),
  // The order timeline — the single audit aggregate for the job (19 §7).
  events: many(serviceOrderEvents),
  // Documents this job produced — 0..n (13 §2).
  contracts: many(contracts),
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

// A contract always belongs to a client (the audit anchor, 13 §3) and
// optionally to the service order that generated it (13 §2, 0..n per order).
export const contractsRelations = relations(contracts, ({ one, many }) => ({
  customer: one(customers, {
    fields: [contracts.customerId],
    references: [customers.id],
  }),
  serviceOrder: one(serviceOrders, {
    fields: [contracts.serviceOrderId],
    references: [serviceOrders.id],
  }),
  equipment: many(contractEquipment),
  events: many(contractEvents),
}));

export const contractEquipmentRelations = relations(contractEquipment, ({ one }) => ({
  contract: one(contracts, {
    fields: [contractEquipment.contractId],
    references: [contracts.id],
  }),
  equipment: one(equipment, {
    fields: [contractEquipment.equipmentId],
    references: [equipment.id],
  }),
}));

export const contractEventsRelations = relations(contractEvents, ({ one }) => ({
  contract: one(contracts, {
    fields: [contractEvents.contractId],
    references: [contracts.id],
  }),
  actor: one(users, {
    fields: [contractEvents.actorId],
    references: [users.id],
  }),
  contact: one(customerContacts, {
    fields: [contractEvents.contactId],
    references: [customerContacts.id],
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
  events: many(reportEvents),
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

export const reportEventsRelations = relations(reportEvents, ({ one }) => ({
  report: one(reports, {
    fields: [reportEvents.reportId],
    references: [reports.id],
  }),
  actor: one(users, {
    fields: [reportEvents.actorId],
    references: [users.id],
  }),
  contact: one(customerContacts, {
    fields: [reportEvents.contactId],
    references: [customerContacts.id],
  }),
}));

export const equipmentRelations = relations(equipment, ({ one, many }) => ({
  customer: one(customers, {
    fields: [equipment.customerId],
    references: [customers.id],
  }),
  reports: many(equipmentReports),
  contracts: many(contractEquipment),
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

// ── WMS (10-wms/01) ────────────────────────────────────────────────────────

export const warehousesRelations = relations(warehouses, ({ one, many }) => ({
  // Self-referential nesting (one level in v1).
  parent: one(warehouses, {
    fields: [warehouses.parentId],
    references: [warehouses.id],
    relationName: 'warehouse_children',
  }),
  children: many(warehouses, { relationName: 'warehouse_children' }),
  assignedUser: one(users, {
    fields: [warehouses.assignedUserId],
    references: [users.id],
  }),
  nodes: many(storageNodes),
  stockEntries: many(stockEntries),
  materialUnits: many(materialUnits),
  materialLots: many(materialLots),
}));

export const storageNodesRelations = relations(storageNodes, ({ one, many }) => ({
  warehouse: one(warehouses, {
    fields: [storageNodes.warehouseId],
    references: [warehouses.id],
  }),
  parent: one(storageNodes, {
    fields: [storageNodes.parentNodeId],
    references: [storageNodes.id],
    relationName: 'storage_node_children',
  }),
  children: many(storageNodes, { relationName: 'storage_node_children' }),
}));

export const materialsRelations = relations(materials, ({ many }) => ({
  units: many(materialUnits),
  lots: many(materialLots),
  stockEntries: many(stockEntries),
  movements: many(movements),
}));

export const materialUnitsRelations = relations(materialUnits, ({ one, many }) => ({
  material: one(materials, {
    fields: [materialUnits.materialId],
    references: [materials.id],
  }),
  warehouse: one(warehouses, {
    fields: [materialUnits.warehouseId],
    references: [warehouses.id],
  }),
  storageNode: one(storageNodes, {
    fields: [materialUnits.storageNodeId],
    references: [storageNodes.id],
  }),
  movementUnits: many(movementUnits),
}));

export const materialLotsRelations = relations(materialLots, ({ one }) => ({
  material: one(materials, {
    fields: [materialLots.materialId],
    references: [materials.id],
  }),
  warehouse: one(warehouses, {
    fields: [materialLots.warehouseId],
    references: [warehouses.id],
  }),
  storageNode: one(storageNodes, {
    fields: [materialLots.storageNodeId],
    references: [storageNodes.id],
  }),
}));

export const stockEntriesRelations = relations(stockEntries, ({ one }) => ({
  material: one(materials, {
    fields: [stockEntries.materialId],
    references: [materials.id],
  }),
  warehouse: one(warehouses, {
    fields: [stockEntries.warehouseId],
    references: [warehouses.id],
  }),
  storageNode: one(storageNodes, {
    fields: [stockEntries.storageNodeId],
    references: [storageNodes.id],
  }),
}));

export const movementReasonDefsRelations = relations(movementReasonDefs, ({ many }) => ({
  movements: many(movements),
}));

export const movementsRelations = relations(movements, ({ one, many }) => ({
  // Joined by `code`, not id — inactive reasons keep rendering in history.
  reasonDef: one(movementReasonDefs, {
    fields: [movements.reason],
    references: [movementReasonDefs.code],
  }),
  material: one(materials, {
    fields: [movements.materialId],
    references: [materials.id],
  }),
  // Two FKs land on `warehouses` (and two on `storage_nodes`), so each side
  // needs an explicit relationName.
  fromWarehouse: one(warehouses, {
    fields: [movements.fromWarehouseId],
    references: [warehouses.id],
    relationName: 'movements_from_warehouse',
  }),
  toWarehouse: one(warehouses, {
    fields: [movements.toWarehouseId],
    references: [warehouses.id],
    relationName: 'movements_to_warehouse',
  }),
  fromNode: one(storageNodes, {
    fields: [movements.fromNodeId],
    references: [storageNodes.id],
    relationName: 'movements_from_node',
  }),
  toNode: one(storageNodes, {
    fields: [movements.toNodeId],
    references: [storageNodes.id],
    relationName: 'movements_to_node',
  }),
  report: one(reports, {
    fields: [movements.reportId],
    references: [reports.id],
  }),
  replenishment: one(replenishments, {
    fields: [movements.replenishmentId],
    references: [replenishments.id],
  }),
  countSession: one(stockCountSessions, {
    fields: [movements.countSessionId],
    references: [stockCountSessions.id],
  }),
  user: one(users, {
    fields: [movements.userId],
    references: [users.id],
  }),
  units: many(movementUnits),
}));

export const movementUnitsRelations = relations(movementUnits, ({ one }) => ({
  movement: one(movements, {
    fields: [movementUnits.movementId],
    references: [movements.id],
  }),
  materialUnit: one(materialUnits, {
    fields: [movementUnits.materialUnitId],
    references: [materialUnits.id],
  }),
}));

export const replenishmentImportsRelations = relations(
  replenishmentImports,
  ({ one, many }) => ({
    // Two FKs land on `warehouses`: the destination and its resolved parent
    // (the one-in-flight scope key).
    warehouse: one(warehouses, {
      fields: [replenishmentImports.warehouseId],
      references: [warehouses.id],
      relationName: 'imports_warehouse',
    }),
    parentWarehouse: one(warehouses, {
      fields: [replenishmentImports.parentWarehouseId],
      references: [warehouses.id],
      relationName: 'imports_parent_warehouse',
    }),
    user: one(users, {
      fields: [replenishmentImports.userId],
      references: [users.id],
    }),
    rows: many(replenishmentImportRows),
    events: many(replenishmentImportEvents),
    replenishment: one(replenishments),
  }),
);

export const replenishmentImportRowsRelations = relations(
  replenishmentImportRows,
  ({ one }) => ({
    import: one(replenishmentImports, {
      fields: [replenishmentImportRows.importId],
      references: [replenishmentImports.id],
    }),
    material: one(materials, {
      fields: [replenishmentImportRows.materialId],
      references: [materials.id],
    }),
    storageNode: one(storageNodes, {
      fields: [replenishmentImportRows.storageNodeId],
      references: [storageNodes.id],
    }),
  }),
);

export const replenishmentImportEventsRelations = relations(
  replenishmentImportEvents,
  ({ one }) => ({
    import: one(replenishmentImports, {
      fields: [replenishmentImportEvents.importId],
      references: [replenishmentImports.id],
    }),
    actor: one(users, {
      fields: [replenishmentImportEvents.actorUserId],
      references: [users.id],
    }),
  }),
);

export const replenishmentsRelations = relations(replenishments, ({ one, many }) => ({
  warehouse: one(warehouses, {
    fields: [replenishments.warehouseId],
    references: [warehouses.id],
  }),
  import: one(replenishmentImports, {
    fields: [replenishments.importId],
    references: [replenishmentImports.id],
  }),
  user: one(users, {
    fields: [replenishments.userId],
    references: [users.id],
  }),
  items: many(replenishmentItems),
  movements: many(movements),
}));

export const replenishmentItemsRelations = relations(replenishmentItems, ({ one }) => ({
  replenishment: one(replenishments, {
    fields: [replenishmentItems.replenishmentId],
    references: [replenishments.id],
  }),
  material: one(materials, {
    fields: [replenishmentItems.materialId],
    references: [materials.id],
  }),
  storageNode: one(storageNodes, {
    fields: [replenishmentItems.storageNodeId],
    references: [storageNodes.id],
  }),
}));

export const stockCountSessionsRelations = relations(
  stockCountSessions,
  ({ one, many }) => ({
    warehouse: one(warehouses, {
      fields: [stockCountSessions.warehouseId],
      references: [warehouses.id],
    }),
    storageNode: one(storageNodes, {
      fields: [stockCountSessions.storageNodeId],
      references: [storageNodes.id],
    }),
    // Two FKs land on `users`: who counted vs who applied.
    openedByUser: one(users, {
      fields: [stockCountSessions.openedBy],
      references: [users.id],
      relationName: 'count_sessions_opened_by',
    }),
    appliedByUser: one(users, {
      fields: [stockCountSessions.appliedBy],
      references: [users.id],
      relationName: 'count_sessions_applied_by',
    }),
    lines: many(stockCountLines),
    movements: many(movements),
  }),
);

export const stockCountLinesRelations = relations(stockCountLines, ({ one }) => ({
  session: one(stockCountSessions, {
    fields: [stockCountLines.countSessionId],
    references: [stockCountSessions.id],
  }),
  material: one(materials, {
    fields: [stockCountLines.materialId],
    references: [materials.id],
  }),
  storageNode: one(storageNodes, {
    fields: [stockCountLines.storageNodeId],
    references: [storageNodes.id],
  }),
}));

export const reportMaterialsRelations = relations(reportMaterials, ({ one }) => ({
  report: one(reports, {
    fields: [reportMaterials.reportId],
    references: [reports.id],
  }),
  material: one(materials, {
    fields: [reportMaterials.materialId],
    references: [materials.id],
  }),
  materialUnit: one(materialUnits, {
    fields: [reportMaterials.materialUnitId],
    references: [materialUnits.id],
  }),
  sourceWarehouse: one(warehouses, {
    fields: [reportMaterials.sourceWarehouseId],
    references: [warehouses.id],
  }),
}));

export const portalUsersRelations = relations(portalUsers, ({ one, many }) => ({
  contact: one(customerContacts, {
    fields: [portalUsers.contactId],
    references: [customerContacts.id],
  }),
  customer: one(customers, {
    fields: [portalUsers.customerId],
    references: [customers.id],
  }),
  inviter: one(users, {
    fields: [portalUsers.invitedBy],
    references: [users.id],
  }),
  deleter: one(users, {
    fields: [portalUsers.deletedBy],
    references: [users.id],
  }),
  grants: many(portalUserGrants),
  passwordResets: many(portalPasswordResets),
}));

export const portalUserGrantsRelations = relations(portalUserGrants, ({ one }) => ({
  user: one(portalUsers, {
    fields: [portalUserGrants.portalUserId],
    references: [portalUsers.id],
  }),
  grantor: one(users, {
    fields: [portalUserGrants.grantedBy],
    references: [users.id],
  }),
  revoker: one(users, {
    fields: [portalUserGrants.revokedBy],
    references: [users.id],
  }),
}));

export const portalPasswordResetsRelations = relations(portalPasswordResets, ({ one }) => ({
  user: one(portalUsers, {
    fields: [portalPasswordResets.portalUserId],
    references: [portalUsers.id],
  }),
}));

export const serviceRequestsRelations = relations(serviceRequests, ({ one, many }) => ({
  customer: one(customers, {
    fields: [serviceRequests.customerId],
    references: [customers.id],
  }),
  contact: one(customerContacts, {
    fields: [serviceRequests.contactId],
    references: [customerContacts.id],
  }),
  portalUser: one(portalUsers, {
    fields: [serviceRequests.portalUserId],
    references: [portalUsers.id],
  }),
  equipment: one(equipment, {
    fields: [serviceRequests.equipmentId],
    references: [equipment.id],
  }),
  closedBy: one(portalUsers, {
    fields: [serviceRequests.closedByPortalUserId],
    references: [portalUsers.id],
    relationName: 'serviceRequestsClosedBy',
  }),
  events: many(serviceRequestEvents),
  quotation: one(quotations, {
    fields: [serviceRequests.quotationId],
    references: [quotations.id],
  }),
}));

export const serviceRequestEventsRelations = relations(serviceRequestEvents, ({ one }) => ({
  request: one(serviceRequests, {
    fields: [serviceRequestEvents.serviceRequestId],
    references: [serviceRequests.id],
  }),
  actor: one(users, {
    fields: [serviceRequestEvents.actorId],
    references: [users.id],
  }),
  portalUser: one(portalUsers, {
    fields: [serviceRequestEvents.portalUserId],
    references: [portalUsers.id],
  }),
}));

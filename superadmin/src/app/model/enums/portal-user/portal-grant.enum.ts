/** The seven portal grants (client-portal 01 §3). Live rows only reach the
 *  UI — a revoked grant stays in the audit trail, never in this list. */
export enum PortalGrant {
  ViewReports = 'view_reports',
  ViewContracts = 'view_contracts',
  ViewQuotations = 'view_quotations',
  ViewServiceOrders = 'view_service_orders',
  ViewEquipment = 'view_equipment',
  ApproveQuotations = 'approve_quotations',
  CreateServiceRequests = 'create_service_requests',
}

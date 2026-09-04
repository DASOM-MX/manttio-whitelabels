export enum PortalGrant {
  ViewReports = 'view_reports',
  ViewContracts = 'view_contracts',
  ViewQuotations = 'view_quotations',
  ViewServiceOrders = 'view_service_orders',
  ViewEquipment = 'view_equipment',
  ApproveQuotations = 'approve_quotations',
  CreateServiceRequests = 'create_service_requests',
  // Withdrawing a request is a separate power from filing one (owner,
  // 2026-09-03): the customer's admin decides who may retract work already
  // in staff's hands.
  CancelServiceRequests = 'cancel_service_requests',
}

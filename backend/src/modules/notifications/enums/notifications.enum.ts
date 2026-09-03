// Notification delivery + persistence enums (notifications plan §1).
// `NotificationType` is open by design: new callers append members (a calendar
// visit-reminder, a contract-expiry warning) without touching this module's
// logic — only the frontend label/icon maps grow. The DB CHECK lists the same
// value set, so extending the enum means extending the CHECK (additive DDL).
export enum NotificationType {
  ReplenishmentReady = 'replenishment_ready', // WMS: awaiting approval (from processing OR resubmit)
  ReplenishmentFailed = 'replenishment_failed', // WMS: import failed / DLQ
  ReplenishmentRejected = 'replenishment_rejected', // WMS: owner/admin sent it back to office
  // Owner-authored explicit send (POST /notifications) — the one type API
  // callers can produce; system types stay reserved for in-code notify().
  Announcement = 'announcement',
  // Core-product events (2026-07-20). The types exist ahead of their
  // triggers — each emitting call site lands in its own module's flow
  // (reports/customers services), recipient policy decided there.
  ReportCreated = 'report_created', // a service report was created
  ReportFinalized = 'report_finalized', // a report reached `finished`
  ClientRegisteredFromWebsite = 'client_registered_from_website', // public lead intake (POST /public/leads)
  ClientRegisteredFromSuperadmin = 'client_registered_from_superadmin', // customer created in-app
  ClientBlacklisted = 'client_blacklisted', // status transition → blacklisted
  ClientUpdated = 'client_updated', // customer record edited
  ClientArchived = 'client_archived', // customer soft-deleted
  ClientInteractionRegistered = 'client_interaction_registered', // manual CRM timeline entry logged
  // Portal service requests (client-portal 06 §5). Emitting call sites land
  // in 06 CP-5/CP-6, in the service-requests module.
  ServiceRequestSubmitted = 'service_request_submitted', // a portal user filed a new request
  ServiceRequestAnswered = 'service_request_answered', // client replied to needs_info
  ServiceRequestClosed = 'service_request_closed', // the customer's admin closed it (A6)
}

// The in-app lifecycle ("hold statuses"). The row itself IS the in-app
// delivery — there is no separate delivered/undelivered state.
// (The email channel — and its EmailDeliveryStatus / NotificationChannel
// enums — is deferred; v1 is in-app only, owner decision 2026-07-20.)
export enum NotificationStatus {
  Unread = 'unread',
  Read = 'read',
}

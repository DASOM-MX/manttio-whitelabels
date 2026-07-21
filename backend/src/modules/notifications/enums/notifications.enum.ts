// Notification delivery + persistence enums (notifications plan §1).
// `NotificationType` is open by design: new callers append members (a calendar
// visit-reminder, a contract-expiry warning) without touching this module's
// logic — only the frontend label/icon maps grow. The DB CHECK lists the same
// value set, so extending the enum means extending the CHECK (additive DDL).
export enum NotificationType {
  ReplenishmentReady = 'replenishment_ready', // WMS: awaiting approval (from processing OR resubmit)
  ReplenishmentFailed = 'replenishment_failed', // WMS: import failed / DLQ
  ReplenishmentRejected = 'replenishment_rejected', // WMS: owner/admin sent it back to office
}

// The in-app lifecycle ("hold statuses"). The row itself IS the in-app
// delivery — there is no separate delivered/undelivered state.
// (The email channel — and its EmailDeliveryStatus / NotificationChannel
// enums — is deferred; v1 is in-app only, owner decision 2026-07-20.)
export enum NotificationStatus {
  Unread = 'unread',
  Read = 'read',
}

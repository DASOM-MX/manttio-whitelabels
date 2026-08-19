// Lifecycle (backend modules/visits, 12 §1 — immutable-record model):
//   scheduled → in_progress (Iniciar, stamps actualStart)
//   → completed (Terminar; terminal) | closed (categorized reason; terminal)
// Terminal states never reopen; "moving" a closed visit is a reschedule that
// mints a new linked record.
export enum VisitStatus {
  Scheduled = 'scheduled',
  InProgress = 'in_progress',
  Completed = 'completed',
  Closed = 'closed',
}

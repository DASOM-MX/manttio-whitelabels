// Lifecycle:
//   pending (offline)
//   → created → in-progress (auto on first PATCH or picture upload)
//   → finished (after signature; locked)
//   → mailed (auto after first email send; locked)
//   → cancelled (soft delete)
// Editable statuses: 'created', 'in-progress'.
export enum ReportStatus {
  Pending = 'pending',
  Created = 'created',
  InProgress = 'in-progress',
  Finished = 'finished',
  Mailed = 'mailed',
  Cancelled = 'cancelled',
}

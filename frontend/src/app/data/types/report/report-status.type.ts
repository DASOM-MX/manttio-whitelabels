// Lifecycle:
//   created → in-progress (auto on first PATCH or picture upload)
//   → finished (after signature; locked)
//   → mailed (auto after first email send; locked)
// Editable statuses: 'created', 'in-progress'.
export type ReportStatus =
  | 'created'
  | 'in-progress'
  | 'finished'
  | 'mailed';

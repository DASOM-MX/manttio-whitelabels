import type { ReportStatus } from '../enums/reports.enum';

// Status transition predicates. The status literals + REPORT_STATUSES array live in
// enums/reports.enum.ts; these predicates are the single place lifecycle decisions
// are made (don't hardcode status strings in controllers/services).
export const isEditableStatus = (s: ReportStatus) =>
  s === 'created' || s === 'in-progress';

export const isFinishedOrMailed = (s: ReportStatus) =>
  s === 'finished' || s === 'mailed';

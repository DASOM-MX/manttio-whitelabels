// TEMPORARY re-export shim (Phase 7 of the modular-architecture refactor).
// Status literals moved to enums/reports.enum.ts; predicates to utils/report-lifecycle.ts.
// Removed in Phase 10.
export { REPORT_STATUSES, type ReportStatus } from '../modules/reports/enums/reports.enum';
export { isEditableStatus, isFinishedOrMailed } from '../modules/reports/utils/report-lifecycle';

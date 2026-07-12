import { ReportStatus } from '../enums/reports.enum';

// Status transition predicates. The ReportStatus enum lives in
// enums/reports.enum.ts; these predicates are the single place lifecycle decisions
// are made (don't hardcode status strings in controllers/services).
export const isEditableStatus = (s: ReportStatus) =>
  s === ReportStatus.Created || s === ReportStatus.InProgress;

export const isFinishedOrMailed = (s: ReportStatus) =>
  s === ReportStatus.Finished || s === ReportStatus.Mailed;

import type { reports } from '../db/schema';

export type ReportStatus = (typeof reports.$inferSelect)['status'];

export const REPORT_STATUSES: readonly ReportStatus[] = [
  'created',
  'in-progress',
  'finished',
  'mailed',
] as const;

export const isEditableStatus = (s: ReportStatus) =>
  s === 'created' || s === 'in-progress';

export const isFinishedOrMailed = (s: ReportStatus) =>
  s === 'finished' || s === 'mailed';

import type { ReportStatus } from '../../enums/report/report-status.enum';

/** p-tag severities per report status — pills always pair color with a label. */
export const REPORT_STATUS_SEVERITIES: Record<
  ReportStatus,
  'secondary' | 'info' | 'success' | 'warn' | 'danger'
> = {
  pending: 'warn',
  created: 'secondary',
  'in-progress': 'info',
  finished: 'success',
  mailed: 'warn',
  cancelled: 'danger',
};

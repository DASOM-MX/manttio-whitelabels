import type { ReportStatus } from '../../../data/dtos/report';

/** p-tag severities per report status — pills always pair color with a label. */
export const REPORT_STATUS_SEVERITIES: Record<
  ReportStatus,
  'secondary' | 'info' | 'success' | 'warn'
> = {
  created: 'secondary',
  'in-progress': 'info',
  finished: 'success',
  mailed: 'warn',
};

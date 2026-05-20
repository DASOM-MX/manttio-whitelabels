import type { ReportStatus } from '../../types/report';

export interface ApiError {
  error: string;
  message?: string;
  status?: ReportStatus;
}

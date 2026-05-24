import type { ReportType, ReportStatus, WorkType } from '../../types/report';

export interface ReportRow {
  id: string;
  reportType: ReportType;
  workType: WorkType | null;
  dateArrival: string | null;
  dateDeparture: string | null;
  createdBy: string;
  assignedTo: string;
  clientId: string;
  signedBy: string | null;
  status: ReportStatus;
  state: string | null;
  signedAt: string | null;
  signedLatitude: number | null;
  signedLongitude: number | null;
  signedAccuracy: number | null;
  finishedAt: string | null;
  mailedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

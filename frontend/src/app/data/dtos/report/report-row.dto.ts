import type { ReportType, ReportStatus } from '../../types/report';

export interface ReportRow {
  id: string;
  reportType: ReportType;
  workType: string | null;
  dateArrival: string | null;
  dateDeparture: string | null;
  createdBy: string;
  assignedTo: string;
  clientId: string;
  signedBy: string | null;
  status: ReportStatus;
  signedAt: string | null;
  signedLatitude: number | null;
  signedLongitude: number | null;
  signedAccuracy: number | null;
  finishedAt: string | null;
  mailedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

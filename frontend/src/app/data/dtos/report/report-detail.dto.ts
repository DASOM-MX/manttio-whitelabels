import type { ReportStatus, WorkType } from '../../types/report';
import type { CapturedSection } from './report-capture.dto';

/** Flat detail of a submitted report, rendered from the stored snapshot. */
export interface ReportDetail {
  id: string;
  templateId: string | null;
  templateName: string;
  reportType: string; // denormalized template name for display
  workType: WorkType | null;
  dateArrival: string | null;
  dateDeparture: string | null;
  createdBy: string;
  assignedTo: string;
  clientId: string;
  serviceOrderId: string | null;
  serviceId: string | null;
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
  sections: CapturedSection[];
  photos: string[];
  signatureUrl: string | null;
  comments?: string | null;
}

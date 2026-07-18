/** Reports DTOs (06-reports.md §1) — status enum confirmed against
 *  `backend/src/modules/reports/models/reports.model.ts` (2026-07-06);
 *  `folio` has no backend column yet — recorded as a backend ask. */

export enum ReportStatus {
  Created = 'created',
  InProgress = 'in-progress',
  Finished = 'finished',
  Mailed = 'mailed',
}

export interface ReportSummary {
  id: string;
  folio?: string;
  customerId: string;
  customerName: string;
  technicianId: string;
  technicianName: string;
  templateId: string;
  templateName: string;
  serviceDate: string;
  status: ReportStatus;
  /** Derived — appears once 09 (billing) lands. */
  billingStatus?: 'unbilled' | 'billed';
  /** Appears once 10 (WMS) lands. */
  hasMaterialTracking?: boolean;
  createdAt: string;
}

/** Answer snapshot model (06 §5.5): label + datatype frozen at capture so
 *  template edits never blank historical reports. View/list/PDF render from
 *  this, never by re-joining the live template. */
export interface ReportAnswer {
  questionId: string;
  label: string;
  datatype: string;
  value: unknown;
}

export interface ReportAnswerSection {
  title: string;
  columns: 1 | 2 | 3;
  answers: ReportAnswer[];
}

export interface ReportDetail extends ReportSummary {
  sections: ReportAnswerSection[];
  signatureUrl?: string;
  photos: string[];
  pdfUrl?: string;
  comments?: string;
}

/** Compact client-scoped report row for the customer 360 "Servicios" tab and
 *  the equipment retro-link picker — served by GET /customers/:id/reports.
 *  `folio` === the report id (folio-style); `technicianName` is joined. */
export interface CustomerReport {
  id: string;
  folio: string;
  serviceDate: string;
  reportType: string;
  workType: string | null;
  technicianName: string | null;
  status: ReportStatus;
}

export interface ReportListQuery {
  page?: number;
  limit?: number;
  search?: string;
  customerId?: string;
  technicianId?: string;
  templateId?: string;
  from?: string;
  to?: string;
  status?: ReportStatus | '';
}

export interface DeleteReportRequest {
  deleteComment: string;
}

/** `POST /reports/:id/email` — all fields optional; the backend defaults `to`
 *  to the customer's email (mirrors the field app's resend flow). */
export interface SendReportEmailRequest {
  to?: string;
  cc?: string[];
  message?: string;
  expiresInDays?: number;
}

/** Reports DTOs (06-reports.md §1) — status enum confirmed against
 *  `backend/src/modules/reports/models/reports.model.ts` (2026-07-06);
 *  `folio` has no backend column yet — recorded as a backend ask. */

export type ReportStatus = 'created' | 'in-progress' | 'finished' | 'mailed';

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

/** The answered template snapshot (backend `data` column, `ReportCapture`
 *  shape) — label/datatype/unit are frozen at capture, so a report renders
 *  the same regardless of later template edits. */
export interface PortalCapturedAnswer {
  questionId: string;
  label: string;
  datatype: string;
  unit?: string;
  value: string | number | boolean | string[] | null;
}

export interface PortalCapturedSection {
  title: string;
  columns: 1 | 2 | 3;
  answers: PortalCapturedAnswer[];
}

export interface PortalReportCapture {
  templateId: string;
  templateName: string;
  sections: PortalCapturedSection[];
}

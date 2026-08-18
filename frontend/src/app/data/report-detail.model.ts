import type { CapturedSection } from './dtos/report/report-capture.dto';

/** Report detail view model, rendered from the stored snapshot sections. */
export interface ReportViewModel {
  id: string;
  /** Template the snapshot was captured against. Needed to save an edit — the
   *  backend re-validates the whole `ReportCapture`, `templateId` included — and
   *  to look the live template up for its option lists. */
  template_id: string | null;
  report_type: string;
  manttio_type: string;
  report_status: boolean;
  date_arrival: string | null;
  date_departure: string | null;
  signature: string | null;
  signed_by: string | null;
  signed_latitude: number | null;
  signed_longitude: number | null;
  signed_accuracy: number | null;
  signed_maps_url: string | null;
  pictures: string[];
  observations: string;
  sections: CapturedSection[];
}

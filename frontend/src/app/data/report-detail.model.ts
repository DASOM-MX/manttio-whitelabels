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
  /** Same name as the column and the API field — the old `observations` alias
   *  was a third name for one value and hid whether it was even populated. */
  comments: string;
  sections: CapturedSection[];
}

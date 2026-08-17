/** Flattened, template-friendly shape the report-detail page renders. The
 *  discriminated per-type fields are optional — read them guarded by `report_type`. */
export interface ReportViewModel {
  id: string;
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
  is_operating?: boolean;
  remote_working?: boolean;
  amperage?: string;
  filter?: boolean;
  inner_voltage?: string;
  unusual_noise?: boolean;
  inner_temperature?: string;
  outer_temperature?: string;
  plc_keys_working?: boolean;
  motor_amperage?: string;
  system_pressure_1?: string;
  system_pressure_2?: string;
  system_pressure_3?: string;
  oil_pressure?: string;
  oil_level?: string;
  flux_switch_working?: boolean;
  air_band_adjustment?: boolean;
  air_good_quality?: boolean;
}

export interface Report {
  id: string;
  client_id: string;
  client_name?: string;
  client_state?: string;
  manttio_type: string;
  report_type: 'minisplit' | 'chiller' | 'uma';
  report_status: boolean;
  date_arrival: string;
  date_departure: string;
  date_ts?: number;
  observations?: string;
  pictures?: string[];
  signature?: string;
  signed_by?: string;
  [extra: string]: any;
}

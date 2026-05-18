// snake_case is deliberate — round-trips verbatim through report_details.data (JSONB)
export interface MinisplitData {
  is_operating: boolean;
  remote_working: boolean;
  amperage: string;
  filter: boolean;
  inner_voltage: string;
  unusual_noise: boolean;
  observations: string;
}

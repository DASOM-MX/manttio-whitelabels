export interface TimezoneOption {
  label: string;
  value: string;
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { label: 'UTC', value: 'UTC' },
  { label: 'Monterrey (UTC−6)', value: 'America/Monterrey' },
  { label: 'CDMX (UTC−6)', value: 'America/Mexico_City' },
  { label: 'Chicago (UTC−6)', value: 'America/Chicago' },
];

export const DEFAULT_TIMEZONE = 'America/Mexico_City';

/** Report content variants the explosion can produce (backend `reportTypes`).
 *  A closed list without a DB check — adding one is a backend literal + a row
 *  here. Labels are the field vocabulary, not the enum values. */
export const REPORT_TYPE_OPTIONS: { label: string; value: string }[] = [
  { label: 'Minisplit', value: 'minisplit' },
  { label: 'Chiller', value: 'chiller' },
  { label: 'UMA', value: 'uma' },
];

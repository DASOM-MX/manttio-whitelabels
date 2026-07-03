// Mexican IANA timezones (post-2022 DST reform). Used by:
//   - customers/validators/customers.validator.ts (enum for `customers.timezone`)
//   - reports/helpers/report-email.helpers.ts (date formatting + disclaimer wording)
//   - reports/helpers/report-pdf.helpers.ts (date formatting)
export const MEXICAN_TIMEZONE_VALUES = [
  'America/Mexico_City',
  'America/Cancun',
  'America/Mazatlan',
  'America/Hermosillo',
  'America/Tijuana',
] as const;

export type MexicanTimezone = (typeof MEXICAN_TIMEZONE_VALUES)[number];

export const MEXICAN_TIMEZONE_LABELS: Record<MexicanTimezone, string> = {
  'America/Mexico_City': 'Centro (CDMX/Monterrey, UTC−6)',
  'America/Cancun': 'Sureste (Cancún, UTC−5)',
  'America/Mazatlan': 'Pacífico (Mazatlán, UTC−7)',
  'America/Hermosillo': 'Sonora (Hermosillo, UTC−7)',
  'America/Tijuana': 'Noroeste (Tijuana, UTC−8/−7)',
};

export const DEFAULT_MEXICAN_TIMEZONE: MexicanTimezone = 'America/Mexico_City';

// Falls back to the raw IANA string if it isn't in the known set — keeps the
// email/PDF renderable even if the DB ever holds a legacy value.
export const labelForTimezone = (tz: string): string =>
  (MEXICAN_TIMEZONE_LABELS as Record<string, string>)[tz] ?? tz;

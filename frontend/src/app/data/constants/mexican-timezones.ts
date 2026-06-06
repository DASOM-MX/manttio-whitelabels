// Mexican IANA timezones (post-2022 DST reform). Mirrors
// `backend/src/lib/timezones.ts` — keep the two in sync.
export const MEXICAN_TIMEZONE_VALUES = [
  'America/Mexico_City',
  'America/Cancun',
  'America/Mazatlan',
  'America/Hermosillo',
  'America/Tijuana',
] as const;

export type MexicanTimezone = (typeof MEXICAN_TIMEZONE_VALUES)[number];

export interface MexicanTimezoneOption {
  label: string;
  value: MexicanTimezone;
}

export const MEXICAN_TIMEZONES: MexicanTimezoneOption[] = [
  { value: 'America/Mexico_City', label: 'Centro (CDMX/Monterrey, UTC−6)' },
  { value: 'America/Cancun', label: 'Sureste (Cancún, UTC−5)' },
  { value: 'America/Mazatlan', label: 'Pacífico (Mazatlán, UTC−7)' },
  { value: 'America/Hermosillo', label: 'Sonora (Hermosillo, UTC−7)' },
  { value: 'America/Tijuana', label: 'Noroeste (Tijuana, UTC−8/−7)' },
];

export const DEFAULT_MEXICAN_TIMEZONE: MexicanTimezone = 'America/Mexico_City';

export const labelForTimezone = (tz: string): string =>
  MEXICAN_TIMEZONES.find((t) => t.value === tz)?.label ?? tz;

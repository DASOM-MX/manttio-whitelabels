// Spanish field labels for rendering report variant payloads in the PDF.
// Must stay in sync with the variant zod schemas in
// `modules/reports/validators/reports.validator.ts`.

export const REPORT_TYPE_LABELS: Record<string, string> = {
  minisplit: 'Minisplit',
  chiller: 'Chiller',
  uma: 'UMA',
};

export const FIELD_LABELS: Record<string, Record<string, string>> = {
  minisplit: {
    is_operating: '¿En operación?',
    remote_working: '¿Control remoto funciona?',
    amperage: 'Amperaje',
    filter: '¿Filtro instalado?',
    inner_voltage: 'Voltaje interno',
    unusual_noise: '¿Ruido inusual?',
    observations: 'Observaciones',
  },
  chiller: {
    is_operating: '¿En operación?',
    inner_temperature: 'Temperatura interna',
    outer_temperature: 'Temperatura externa',
    inner_voltage: 'Voltaje interno',
    plc_keys_working: '¿Teclas del PLC funcionan?',
    motor_amperage: 'Amperaje del motor',
    system_pressure_1: 'Presión del sistema 1',
    system_pressure_2: 'Presión del sistema 2',
    system_pressure_3: 'Presión del sistema 3',
    oil_pressure: 'Presión de aceite',
    oil_level: 'Nivel de aceite',
    flux_switch_working: '¿Flux switch funciona?',
    unusual_noise: '¿Ruido inusual?',
    observations: 'Observaciones',
  },
  uma: {
    is_operating: '¿En operación?',
    air_band_adjustment: '¿Ajuste de banda de aire?',
    inner_temperature: 'Temperatura interna',
    outer_temperature: 'Temperatura externa',
    air_good_quality: '¿Buena calidad de aire?',
    inner_voltage: 'Voltaje interno',
    motor_amperage: 'Amperaje del motor',
    unusual_noise: '¿Ruido inusual?',
    observations: 'Observaciones',
  },
};

export const labelForField = (reportType: string, field: string) =>
  FIELD_LABELS[reportType]?.[field] ?? field;

export const formatBoolean = (v: unknown) => (v === true ? 'Sí' : v === false ? 'No' : '—');

export const formatScalar = (v: unknown): string => {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return formatBoolean(v);
  if (typeof v === 'string') return v.trim() === '' ? '—' : v;
  return String(v);
};

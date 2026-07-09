/** Magnitude select for number questions (06 §5.1 rule, added 2026-07-09):
 *  grouped by category and nullable — "Sin unidad" is a first-class choice.
 *  Values are the display symbols themselves: they ride the template doc
 *  as-is and render next to the field label (builder preview, field app,
 *  PDF), so no lookup table is needed downstream. */
export const MAGNITUDE_OPTIONS: {
  label: string;
  items: { label: string; value: string }[];
}[] = [
  {
    label: 'General',
    items: [
      { label: 'Sin unidad', value: '' },
      { label: 'Unidades (u)', value: 'u' },
      { label: 'Pares (par)', value: 'par' },
      { label: 'Porcentaje (%)', value: '%' },
    ],
  },
  {
    label: 'Longitud',
    items: [
      { label: 'Milímetros (mm)', value: 'mm' },
      { label: 'Centímetros (cm)', value: 'cm' },
      { label: 'Metros (m)', value: 'm' },
      { label: 'Pulgadas (in)', value: 'in' },
      { label: 'Pies (ft)', value: 'ft' },
    ],
  },
  {
    label: 'Masa',
    items: [
      { label: 'Miligramos (mg)', value: 'mg' },
      { label: 'Gramos (g)', value: 'g' },
      { label: 'Kilogramos (kg)', value: 'kg' },
      { label: 'Libras (lb)', value: 'lb' },
    ],
  },
  {
    label: 'Volumen',
    items: [
      { label: 'Mililitros (ml)', value: 'ml' },
      { label: 'Litros (l)', value: 'l' },
      { label: 'Metros cúbicos (m³)', value: 'm³' },
      { label: 'Galones (gal)', value: 'gal' },
    ],
  },
  {
    label: 'Eléctrico',
    items: [
      { label: 'Volts (V)', value: 'V' },
      { label: 'Amperes (A)', value: 'A' },
      { label: 'Ohms (Ω)', value: 'Ω' },
      { label: 'Watts (W)', value: 'W' },
      { label: 'Kilowatts (kW)', value: 'kW' },
      { label: 'Hertz (Hz)', value: 'Hz' },
    ],
  },
  {
    label: 'Presión',
    items: [
      { label: 'PSI (psi)', value: 'psi' },
      { label: 'Bar (bar)', value: 'bar' },
      { label: 'Kilopascales (kPa)', value: 'kPa' },
    ],
  },
  {
    label: 'Temperatura',
    items: [
      { label: 'Celsius (°C)', value: '°C' },
      { label: 'Fahrenheit (°F)', value: '°F' },
    ],
  },
  {
    label: 'Caudal',
    items: [
      { label: 'CFM (cfm)', value: 'cfm' },
      { label: 'Litros por minuto (l/min)', value: 'l/min' },
      { label: 'Metros cúbicos por hora (m³/h)', value: 'm³/h' },
    ],
  },
  {
    label: 'Tiempo',
    items: [
      { label: 'Segundos (s)', value: 's' },
      { label: 'Minutos (min)', value: 'min' },
      { label: 'Horas (h)', value: 'h' },
    ],
  },
];

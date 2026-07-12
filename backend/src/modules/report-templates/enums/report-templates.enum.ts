// Lifecycle (superadmin plan 06 §5.2): draft ⇄ active → disabled (terminal).
// An enum so services compare against named members (`status === TemplateStatus.Draft`)
// rather than magic strings; the string values are what the DB persists.
export enum TemplateStatus {
  Draft = 'draft',
  Active = 'active',
  Disabled = 'disabled',
}

// The final nine datatypes (06 §5.1, decided 2026-07-05). No `photo` — the
// fixed images block covers photos.
export enum QuestionDatatype {
  Text = 'text',
  Textarea = 'textarea',
  Number = 'number',
  Date = 'date',
  Boolean = 'boolean',
  Select = 'select',
  Multiselect = 'multiselect',
  Radio = 'radio',
  CheckboxGroup = 'checkbox_group',
}

// Magnitude whitelist for number questions (06 §5.1 rule, 2026-07-09). The
// values are display symbols rendered as-is next to the field label (field
// app, PDF); member names spell them out for readability at the comparison
// site. The category grouping is a superadmin presentation concern. Absence =
// unitless — `unit` is only ever accepted on `number` questions.
export enum Magnitude {
  Unit = 'u',
  Pair = 'par',
  Percent = '%',
  Millimeter = 'mm',
  Centimeter = 'cm',
  Meter = 'm',
  Inch = 'in',
  Foot = 'ft',
  Milligram = 'mg',
  Gram = 'g',
  Kilogram = 'kg',
  Pound = 'lb',
  Milliliter = 'ml',
  Liter = 'l',
  CubicMeter = 'm³',
  Gallon = 'gal',
  Volt = 'V',
  Ampere = 'A',
  Ohm = 'Ω',
  Watt = 'W',
  Kilowatt = 'kW',
  Hertz = 'Hz',
  Psi = 'psi',
  Bar = 'bar',
  Kilopascal = 'kPa',
  Celsius = '°C',
  Fahrenheit = '°F',
  CubicFeetPerMinute = 'cfm',
  LitersPerMinute = 'l/min',
  CubicMetersPerHour = 'm³/h',
  Second = 's',
  Minute = 'min',
  Hour = 'h',
}

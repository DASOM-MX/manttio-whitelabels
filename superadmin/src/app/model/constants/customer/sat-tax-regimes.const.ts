/** SAT c_RegimenFiscal — common subset only (07 §1); the full catalog ships
 *  when CFDI stamping lands (deferred indefinitely, 00 §4). */
export const SAT_TAX_REGIMES: { code: string; label: string }[] = [
  { code: '601', label: '601 — General de Ley Personas Morales' },
  { code: '603', label: '603 — Personas Morales con Fines no Lucrativos' },
  { code: '605', label: '605 — Sueldos y Salarios' },
  { code: '606', label: '606 — Arrendamiento' },
  { code: '612', label: '612 — PF con Actividades Empresariales y Profesionales' },
  { code: '616', label: '616 — Sin obligaciones fiscales' },
  { code: '620', label: '620 — Sociedades Cooperativas de Producción' },
  { code: '621', label: '621 — Incorporación Fiscal' },
  { code: '622', label: '622 — Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras' },
  { code: '626', label: '626 — Régimen Simplificado de Confianza (RESICO)' },
];

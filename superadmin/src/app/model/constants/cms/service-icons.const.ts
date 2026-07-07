/** Curated service-card icon set (04 §6) — exactly 12 lucide codes so the
 *  picker renders a fixed 3×4 grid. Codes travel in `CmsHomeService.icon`;
 *  the code→svg mapping lives in `cms/components/service-icon/`. */
export const SERVICE_ICONS = [
  { code: 'wrench', label: 'Llave (mantenimiento)' },
  { code: 'snowflake', label: 'Copo de nieve (refrigeración)' },
  { code: 'thermometer', label: 'Termómetro' },
  { code: 'fan', label: 'Ventilador' },
  { code: 'flame', label: 'Flama (calefacción)' },
  { code: 'droplets', label: 'Gotas (fluidos)' },
  { code: 'gauge', label: 'Manómetro' },
  { code: 'zap', label: 'Rayo (eléctrico)' },
  { code: 'settings', label: 'Engranaje (ingeniería)' },
  { code: 'truck', label: 'Camión (renta y entrega)' },
  { code: 'package', label: 'Paquete (venta de equipo)' },
  { code: 'shield-check', label: 'Escudo (garantía)' },
] as const;

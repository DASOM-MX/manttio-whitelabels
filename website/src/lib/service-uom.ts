// Unit-of-measure labels for the public catalog (18 §1). `GET /public/services`
// sends the wire code (`metro_cuadrado`), never a label — the superadmin owns
// the tenant-facing wording, so the site owns the visitor-facing one.
//
// Two deliberate differences from the superadmin's map: the labels are the bare
// symbol or lowercase noun, because they read mid-phrase ("MXN / m²", "por
// hora") rather than as dropdown entries; and an unknown code degrades to
// readable text instead of throwing, so a backend that grows a unit before the
// site redeploys shows "tonelada corta", not a broken card.
const SERVICE_UOM_LABELS: Record<string, string> = {
  servicio: 'servicio',
  visita: 'visita',
  viaje: 'viaje',

  hora: 'hora',
  dia: 'día',
  semana: 'semana',
  mes: 'mes',
  anio: 'año',

  unidad: 'unidad',
  pieza: 'pieza',
  caja: 'caja',
  pallet: 'pallet',
  resma: 'resma',

  metro: 'm',
  kilometro: 'km',
  yarda: 'yd',
  pulgada: 'in',

  metro_cuadrado: 'm²',
  hectarea: 'ha',

  metro_cubico: 'm³',
  litro: 'L',
  mililitro: 'mL',
  galon: 'gal',
  onza_liquida: 'fl oz',

  kilogramo: 'kg',
  onza: 'oz',

  btu: 'BTU',
  millon_btu: 'MMBTU',
  btu_pie_cubico: 'BTU/ft³',
  tonelada_refrigeracion: 'TR',
};

export function serviceUomLabel(uom: string): string {
  return SERVICE_UOM_LABELS[uom] ?? uom.replace(/_/g, ' ');
}

/** Catalog column → Spanish label, for rendering `service_updated` per-field
 *  diffs. Keys are the field names exactly as the backend writes them into
 *  `changes` — an unknown key (a column added later) falls back to the raw
 *  name rather than hiding the edit. */
export const SERVICE_FIELD_LABELS: Record<string, string> = {
  name: 'Nombre',
  price: 'Precio',
  cost: 'Costo interno',
  uom: 'Unidad',
  taxRate: 'IVA',
  internalServiceCode: 'Código interno',
  description: 'Descripción interna',
  websiteDescription: 'Descripción del sitio',
  websiteImageKey: 'Imagen del sitio',
  satProdServCode: 'Clave SAT (producto/servicio)',
  satUnitCode: 'Clave SAT (unidad)',
  isReportSource: 'Genera reporte',
  isListableInWebsite: 'Listado en el sitio',
  isPriceVisibleInWebsite: 'Precio visible en el sitio',
};

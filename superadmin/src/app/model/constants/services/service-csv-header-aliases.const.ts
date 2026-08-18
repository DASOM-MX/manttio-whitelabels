import type { ServiceCsvColumn } from './service-csv-columns.const';

/** Normalized tenant-header → canonical field (18 §6.3). Keys are the
 *  *normalized* form (lowercase, accents folded, punctuation stripped) of
 *  headers seen in real price lists — "P.V." arrives here as `pv`, "Clave
 *  SAT" as `clavesat`. Canonical column names match by normalization alone
 *  and need no entry. First auto-match wins; anything unlisted the owner
 *  maps by hand, which is exactly what the mapper screen is for. */
export const SERVICE_CSV_HEADER_ALIASES: Record<string, ServiceCsvColumn> = {
  concepto: 'name',
  servicio: 'name',
  nombre: 'name',
  articulo: 'name',
  producto: 'name',

  precio: 'price',
  preciodeventa: 'price',
  precioventa: 'price',
  preciounitario: 'price',
  preciopublico: 'price',
  pv: 'price',
  importe: 'price',

  costo: 'cost',
  costointerno: 'cost',
  costounitario: 'cost',

  unidad: 'uom',
  um: 'uom',
  unidaddemedida: 'uom',
  medida: 'uom',

  iva: 'taxRate',
  tasa: 'taxRate',
  tasadeiva: 'taxRate',
  tasaiva: 'taxRate',
  impuesto: 'taxRate',

  codigo: 'internalServiceCode',
  clave: 'internalServiceCode',
  sku: 'internalServiceCode',
  codigointerno: 'internalServiceCode',
  claveinterna: 'internalServiceCode',

  descripcion: 'description',
  descripcioninterna: 'description',
  notas: 'description',
  observaciones: 'description',

  descripciondelsitio: 'websiteDescription',
  descripcionweb: 'websiteDescription',
  descripcionpublica: 'websiteDescription',

  clavesat: 'satProdServCode',
  claveprodserv: 'satProdServCode',
  claveproductoservicio: 'satProdServCode',
  cclaveprodserv: 'satProdServCode',

  claveunidad: 'satUnitCode',
  claveunidadsat: 'satUnitCode',
  cclaveunidad: 'satUnitCode',

  generareporte: 'isReportSource',
  generareportes: 'isReportSource',
  reporte: 'isReportSource',
  requierereporte: 'isReportSource',

  sitioweb: 'isListableInWebsite',
  publicado: 'isListableInWebsite',
  listado: 'isListableInWebsite',
  mostrarensitio: 'isListableInWebsite',

  preciovisible: 'isPriceVisibleInWebsite',
  mostrarprecio: 'isPriceVisibleInWebsite',
};

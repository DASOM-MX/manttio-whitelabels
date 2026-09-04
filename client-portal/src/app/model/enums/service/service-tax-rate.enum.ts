/** Mexican IVA rate frozen onto each quotation line — mirrors the backend
 *  `ServiceTaxRate`. `Iva0` and `Exento` both compute to 0 MXN but are kept
 *  distinct (different CFDI treatment). */
export enum ServiceTaxRate {
  Iva16 = 'iva_16',
  Iva8 = 'iva_8',
  Iva0 = 'iva_0',
  Exento = 'exento',
}

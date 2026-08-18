/** Canonical CSV column order (18 §6.3) — shared by export and the import
 *  mapper so a file exported here re-imports with every column auto-matched.
 *  `websiteImageKey` is deliberately absent: R2 keys are deploy-specific and
 *  meaningless in a portable price list. */
export const SERVICE_CSV_COLUMNS = [
  'name',
  'price',
  'cost',
  'uom',
  'taxRate',
  'internalServiceCode',
  'description',
  'websiteDescription',
  'satProdServCode',
  'satUnitCode',
  'isListableInWebsite',
  'isPriceVisibleInWebsite',
] as const;

export type ServiceCsvColumn = (typeof SERVICE_CSV_COLUMNS)[number];

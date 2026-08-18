import type { ServiceTaxRate, ServiceUom } from '../../dtos/service';
import type { ServiceCsvColumn } from '../../../model/constants/services/service-csv-columns.const';

export type ServiceImportField = ServiceCsvColumn;

/** Where one catalog field reads from (18 §6.3): a file column, one fixed
 *  value applied to every row (the escape hatch for lists with no unidad/IVA
 *  column), or nothing. A required field carries `kind: 'column'` with an
 *  empty `header` until the owner picks one — the incomplete state the page
 *  gates on. */
export type ServiceFieldMapping =
  | { kind: 'column'; header: string }
  | { kind: 'fixed'; value: string }
  | { kind: 'omit' };

export type ServiceImportMapping = Record<ServiceImportField, ServiceFieldMapping>;

/** One canonical row of `POST /services/import` — `SaveServiceRequest` minus
 *  the photo key (R2 keys aren't CSV columns) and the clone provenance. */
export interface ServiceImportRow {
  name: string;
  price: number;
  cost?: number;
  uom: ServiceUom;
  taxRate: ServiceTaxRate;
  internalServiceCode?: string;
  description?: string;
  websiteDescription?: string;
  satProdServCode?: string;
  satUnitCode?: string;
  isListableInWebsite: boolean;
  isPriceVisibleInWebsite: boolean;
}

export interface ServiceImportPreviewRow {
  /** The record's 1-based ordinal in the source file (`CsvRecord.line`) —
   *  blank rows counted, so it matches the row number Excel shows. This is
   *  what the owner sees, and what backend 422 indexes map back to. */
  line: number;
  /** The canonical payload row, or null while `errors` is non-empty. */
  row: ServiceImportRow | null;
  errors: string[];
}

export interface ServiceImportPreview {
  rows: ServiceImportPreviewRow[];
  errorCount: number;
}

/** The 422 body of `POST /services/import` — displayed verbatim, per row. */
export interface ServiceImportErrorRow {
  /** 0-based index into the submitted rows; -1 = file-level. */
  index: number;
  message: string;
}

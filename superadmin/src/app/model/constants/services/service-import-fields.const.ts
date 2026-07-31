import { SERVICE_FIELD_LABELS } from './service-field-labels.const';
import type { ServiceImportField } from '../../../data/types/services/service-import';

export type ServiceImportFieldKind = 'text' | 'money' | 'uom' | 'taxRate' | 'boolean';

export interface ServiceImportFieldSpec {
  field: ServiceImportField;
  /** Shared with the audit-trail diff labels so the two screens never
   *  disagree on what a column is called. */
  label: string;
  kind: ServiceImportFieldKind;
  /** Must map to a file column — no fixed value, no Omitir (18 §6.3). */
  requiresColumn?: boolean;
  /** Fixed value preselected when no column auto-matches — the catalog
   *  defaults (`servicio` / `iva_16`), so a bare name+price list imports
   *  without touching the other rows. */
  fixedDefault?: string;
}

/** The mapper's row list, in canonical CSV column order. */
export const SERVICE_IMPORT_FIELDS: ServiceImportFieldSpec[] = [
  { field: 'name', label: SERVICE_FIELD_LABELS['name']!, kind: 'text', requiresColumn: true },
  { field: 'price', label: SERVICE_FIELD_LABELS['price']!, kind: 'money', requiresColumn: true },
  { field: 'cost', label: SERVICE_FIELD_LABELS['cost']!, kind: 'money' },
  { field: 'uom', label: SERVICE_FIELD_LABELS['uom']!, kind: 'uom', fixedDefault: 'servicio' },
  { field: 'taxRate', label: SERVICE_FIELD_LABELS['taxRate']!, kind: 'taxRate', fixedDefault: 'iva_16' },
  {
    field: 'internalServiceCode',
    label: SERVICE_FIELD_LABELS['internalServiceCode']!,
    kind: 'text',
  },
  { field: 'description', label: SERVICE_FIELD_LABELS['description']!, kind: 'text' },
  {
    field: 'websiteDescription',
    label: SERVICE_FIELD_LABELS['websiteDescription']!,
    kind: 'text',
  },
  { field: 'satProdServCode', label: SERVICE_FIELD_LABELS['satProdServCode']!, kind: 'text' },
  { field: 'satUnitCode', label: SERVICE_FIELD_LABELS['satUnitCode']!, kind: 'text' },
  {
    field: 'isListableInWebsite',
    label: SERVICE_FIELD_LABELS['isListableInWebsite']!,
    kind: 'boolean',
    fixedDefault: 'false',
  },
  {
    field: 'isPriceVisibleInWebsite',
    label: SERVICE_FIELD_LABELS['isPriceVisibleInWebsite']!,
    kind: 'boolean',
    fixedDefault: 'false',
  },
];

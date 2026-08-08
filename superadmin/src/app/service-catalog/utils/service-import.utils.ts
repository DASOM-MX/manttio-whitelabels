import { ServiceTaxRate, ServiceUom } from '../../data/dtos/service';
import { SERVICE_CSV_HEADER_ALIASES } from '../../model/constants/services/service-csv-header-aliases.const';
import { SERVICE_IMPORT_FIELDS } from '../../model/constants/services/service-import-fields.const';
import { SERVICE_TAX_RATE_LABELS } from '../../model/constants/services/service-tax-rate-labels.const';
import { SERVICE_UOM_LABELS } from '../../model/constants/services/service-uom-labels.const';
import { SERVICE_UOM_SHORT_LABELS } from '../../model/constants/services/service-uom-short-labels.const';
import type { ParsedCsv } from './csv.utils';
import type {
  ServiceFieldMapping,
  ServiceImportField,
  ServiceImportMapping,
  ServiceImportPreview,
  ServiceImportPreviewRow,
  ServiceImportRow,
} from '../../data/types/services/service-import';

/** The matching currency of the whole mapper (18 §6.3): lowercase, accents
 *  folded, everything but letters and digits stripped — "P.V." → `pv`,
 *  "Descripción" → `descripcion`. */
export const normalizeCsvToken = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

/** Enum cells accept the wire code **or** the Spanish label, accent-folded.
 *  Labels register in both forms — with and without their parenthetical
 *  symbol — so "Metro cuadrado" and "Metro cuadrado (m²)" both land, same for
 *  "IVA 16%" vs "IVA 16% (general)". Built once per enum.
 *
 *  A token claimed by two different members is ambiguous and resolves to
 *  neither — better a per-row "Unidad desconocida" than a silently wrong
 *  unit. (The short labels make this real: "m²" and "m³" both fold to plain
 *  "m", so "m" stays unclaimed rather than meaning whichever wrote last.) */
const tokenTable = <T extends string>(...labelSets: Record<T, string>[]): Map<string, T> => {
  const table = new Map<string, T>();
  const ambiguous = new Set<string>();
  const claim = (raw: string, code: T): void => {
    const key = normalizeCsvToken(raw);
    if (key === '' || ambiguous.has(key)) return;
    const prior = table.get(key);
    if (prior !== undefined && prior !== code) {
      table.delete(key);
      ambiguous.add(key);
      return;
    }
    table.set(key, code);
  };
  for (const labels of labelSets) {
    for (const [code, label] of Object.entries(labels) as [T, string][]) {
      claim(code, code);
      claim(label, code);
      claim(label.replace(/\(.*?\)/g, ''), code);
    }
  }
  return table;
};

// Short labels register too: for the thermal units the symbol IS how a price
// list spells them ("TR", "MMBTU", "BTU/ft³"), and a tenant CSV shouldn't
// need the long form to be understood.
const UOM_TOKENS = tokenTable<ServiceUom>(SERVICE_UOM_LABELS, SERVICE_UOM_SHORT_LABELS);
const TAX_TOKENS = tokenTable<ServiceTaxRate>(SERVICE_TAX_RATE_LABELS);

const TRUE_TOKENS = new Set(['true', 'si', '1', 'x', 'verdadero']);
const FALSE_TOKENS = new Set(['false', 'no', '0', 'falso']);

/** Preselect a mapping from the file's headers: canonical names and the alias
 *  list, normalized. Each header is claimed at most once — two columns can't
 *  both feed the same field, and a claimed column isn't re-offered. Required
 *  fields with no match stay as an empty column pick (the page blocks on it);
 *  the rest fall back to their fixed default or Omitir. */
export const autoMatchMapping = (headers: string[]): ServiceImportMapping => {
  const claimed = new Set<string>();
  const mapping = {} as ServiceImportMapping;

  for (const spec of SERVICE_IMPORT_FIELDS) {
    const fieldToken = normalizeCsvToken(spec.field);
    const header = headers.find((h) => {
      if (claimed.has(h)) return false;
      const token = normalizeCsvToken(h);
      return token === fieldToken || SERVICE_CSV_HEADER_ALIASES[token] === spec.field;
    });

    if (header !== undefined) {
      claimed.add(header);
      mapping[spec.field] = { kind: 'column', header };
    } else if (spec.requiresColumn) {
      mapping[spec.field] = { kind: 'column', header: '' };
    } else if (spec.fixedDefault !== undefined) {
      mapping[spec.field] = { kind: 'fixed', value: spec.fixedDefault };
    } else {
      mapping[spec.field] = { kind: 'omit' };
    }
  }
  return mapping;
};

/** `name` and `price` must read from a column (18 §6.3) — the fields still
 *  waiting for a pick, in mapper order. */
export const unmappedRequiredFields = (mapping: ServiceImportMapping): ServiceImportField[] =>
  SERVICE_IMPORT_FIELDS.filter((spec) => {
    const current = mapping[spec.field];
    return spec.requiresColumn && (current.kind !== 'column' || current.header === '');
  }).map((spec) => spec.field);

/** Money cells as tenants type them: `$1,500.00`, `1500`, ` 1,500 `. */
const parseMoney = (raw: string): number | null => {
  const cleaned = raw.replace(/[$\s,]/g, '');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : null;
};

const cellFor = (
  mapping: ServiceFieldMapping,
  headers: string[],
  row: string[],
): string => {
  if (mapping.kind === 'omit') return '';
  if (mapping.kind === 'fixed') return mapping.value;
  const index = headers.indexOf(mapping.header);
  return index === -1 ? '' : (row[index] ?? '');
};

/** Mapping + parsed file → canonical rows with per-row errors (18 §6.3).
 *  Everything the preview flags here the backend re-checks — this exists so
 *  the owner fixes the file *before* submitting, not so the server can relax.
 *  Unknown enum tokens are errors, never silent guesses. `existingCodes` is
 *  the live catalog's código set, for the dup-vs-catalog check. */
export const resolveServiceImport = (
  parsed: ParsedCsv,
  mapping: ServiceImportMapping,
  existingCodes: ReadonlySet<string>,
): ServiceImportPreview => {
  const seenCodes = new Set<string>();
  const rows: ServiceImportPreviewRow[] = parsed.rows.map((record) => {
    const errors: string[] = [];
    const raw = (field: ServiceImportField): string =>
      cellFor(mapping[field], parsed.headers, record.cells).trim();

    const name = raw('name');
    if (!name) errors.push('Nombre vacío');

    const price = parseMoney(raw('price'));
    if (price === null) errors.push(`Precio inválido: "${raw('price')}"`);

    const costRaw = raw('cost');
    const cost = costRaw === '' ? undefined : parseMoney(costRaw);
    if (cost === null) errors.push(`Costo inválido: "${costRaw}"`);

    const uomRaw = raw('uom');
    const uom = UOM_TOKENS.get(normalizeCsvToken(uomRaw));
    if (!uom) errors.push(`Unidad desconocida: "${uomRaw}"`);

    const taxRaw = raw('taxRate');
    const taxRate = TAX_TOKENS.get(normalizeCsvToken(taxRaw));
    if (!taxRate) errors.push(`IVA desconocido: "${taxRaw}"`);

    const bool = (field: ServiceImportField, label: string): boolean => {
      const token = normalizeCsvToken(raw(field));
      if (token === '' || FALSE_TOKENS.has(token)) return false;
      if (TRUE_TOKENS.has(token)) return true;
      errors.push(`${label} inválido: "${raw(field)}" (usa sí/no)`);
      return false;
    };
    const isListable = bool('isListableInWebsite', 'Listado en el sitio');
    const isPriceVisible = bool('isPriceVisibleInWebsite', 'Precio visible');

    const code = raw('internalServiceCode');
    if (code) {
      if (seenCodes.has(code)) errors.push(`El código "${code}" se repite en el archivo`);
      else if (existingCodes.has(code)) {
        errors.push(`El código "${code}" ya existe en el catálogo`);
      } else {
        seenCodes.add(code);
      }
    }

    const optional = (field: ServiceImportField): string | undefined =>
      raw(field) === '' ? undefined : raw(field);

    const row: ServiceImportRow | null = errors.length
      ? null
      : {
          name,
          price: price!,
          cost: cost ?? undefined,
          uom: uom!,
          taxRate: taxRate!,
          internalServiceCode: code || undefined,
          description: optional('description'),
          websiteDescription: optional('websiteDescription'),
          satProdServCode: optional('satProdServCode'),
          satUnitCode: optional('satUnitCode'),
          isListableInWebsite: isListable,
          // Mirrors the server invariant: unlisted → never price-visible.
          isPriceVisibleInWebsite: isListable && isPriceVisible,
        };

    // The record's own source ordinal — blank separator rows in the file
    // don't shift it, so it is the number the owner sees in Excel.
    return { line: record.line, row, errors };
  });

  return { rows, errorCount: rows.filter((r) => r.errors.length > 0).length };
};

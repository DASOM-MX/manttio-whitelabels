import { MaterialTracking } from '../enums/materials.enum';
import { RowErrorCode } from '../enums/replenishment-imports.enum';

// The staged-row rules, in ONE place (10-wms/02 §6). Two callers walk them: the
// queue consumer at parse time (11 §2) and the row PATCH at review time — the
// plan asks for exactly this ("the handler shares its row-error modules with
// confirm-time revalidation"), because a row the reviewer fixed must be judged
// by the same rules that flagged it.

/** These do NOT gate approval (owner 2026-07-20): the row promotes as a flagged
 *  item — recorded in the document, visible for provider follow-up, but no
 *  movement, no unit, no stock effect. Everything else must be fixed first
 *  (`409 import_has_errors`). */
export const UNPROCESSABLE_ROW_ERRORS: readonly RowErrorCode[] = [
  RowErrorCode.DuplicateSerial,
  RowErrorCode.SerialExists,
];

export const isUnprocessable = (error: RowErrorCode | null | undefined): boolean =>
  error !== null && error !== undefined && UNPROCESSABLE_ROW_ERRORS.includes(error);

/** What blocks approval: an error that is not one of the two unprocessable
 *  ones. A clean row blocks nothing. */
export const isFixableError = (error: RowErrorCode | null | undefined): boolean =>
  error !== null && error !== undefined && !UNPROCESSABLE_ROW_ERRORS.includes(error);

export interface StagedRowFacts {
  /** `null` when no material resolved by SKU or UPC — that IS `unknown_sku`. */
  tracking: MaterialTracking | null;
  quantity: string | null;
  serial: string | null;
  lot: string | null;
  /** The mapped expiry column held something unparseable, and nothing has
   *  replaced it since. Sticky: a reviewer who edits other fields does not
   *  make a bad date good. */
  expiryUnresolved: boolean;
  /** The same serial appears earlier in this file (first occurrence wins). */
  serialDuplicateInFile: boolean;
  /** The serial is already claimed in `material_units`. */
  serialClaimedInDb: boolean;
}

const positive = (quantity: string | null) => {
  if (quantity === null) return false;
  const parsed = Number(quantity);
  return Number.isFinite(parsed) && parsed > 0;
};

/** One error per row, because the row carries one error column — so the order
 *  below is a priority, and it runs FIXABLE FIRST on purpose. A reviewer can
 *  act on `quantity_on_serialized`; being told `serial_exists` while the
 *  quantity is also wrong just hides the half they can do something about. The
 *  unprocessable one resurfaces on the next validation once the row is clean. */
export const validateStagedRow = (facts: StagedRowFacts): RowErrorCode | null => {
  if (facts.tracking === null) return RowErrorCode.UnknownSku;

  if (facts.tracking === MaterialTracking.Serialized) {
    if (facts.serial === null || facts.serial === '') return RowErrorCode.MissingSerial;
    // A serialized row is one physical piece. Absent means one; anything else
    // means the sheet is describing something this row cannot represent.
    if (facts.quantity !== null && Number(facts.quantity) !== 1) {
      return RowErrorCode.QuantityOnSerialized;
    }
  }

  if (facts.tracking === MaterialTracking.Lot) {
    if (facts.lot === null || facts.lot === '') return RowErrorCode.MissingLot;
    if (!positive(facts.quantity)) return RowErrorCode.BadQuantity;
    if (facts.expiryUnresolved) return RowErrorCode.BadExpiry;
  }

  if (facts.tracking === MaterialTracking.Unserialized && !positive(facts.quantity)) {
    return RowErrorCode.BadQuantity;
  }

  if (facts.tracking === MaterialTracking.Serialized) {
    if (facts.serialDuplicateInFile) return RowErrorCode.DuplicateSerial;
    if (facts.serialClaimedInDb) return RowErrorCode.SerialExists;
  }

  return null;
};

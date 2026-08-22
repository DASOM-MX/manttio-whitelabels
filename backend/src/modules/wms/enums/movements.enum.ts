// Movement journal enums (10-wms/01 §1). A movement is one append-only journal
// row — see `models/movements.model.ts` for the no-UPDATE/no-DELETE rule.
export enum MovementType {
  Inbound = 'inbound',
  Transfer = 'transfer',
  Consumption = 'consumption',
  // The ONLY correction instrument (master plan §4): owner/admin, direction +
  // reason + notes required. Every fix is a new readjustment, never an edit.
  Readjustment = 'readjustment',
}

export enum ReadjustmentDirection {
  In = 'in',
  Out = 'out',
}

// What a movement reason may apply to (`movement_reason_defs.applies_to`).
// Readjustments map through `readjustment_{direction}`; the backend validates
// type ↔ context on every movement (`400 invalid_reason_context`).
export enum ReasonContext {
  Inbound = 'inbound',
  Transfer = 'transfer',
  ReadjustmentIn = 'readjustment_in',
  ReadjustmentOut = 'readjustment_out',
  // `report_binding` only — never user-selectable in any dialog.
  Consumption = 'consumption',
}

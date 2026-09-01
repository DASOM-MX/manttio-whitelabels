// What kind of document this is (13 §1.1). A **fixed** backend enum, not the
// tenant-customizable soft entity — the earlier `ContractTypeDef` approach was
// dropped for contracts (00 §4, decided 2026-07-24).
//
// Type is descriptive metadata only: **no behavior branches on it**. A
// `programmed_maintenance` contract does not auto-schedule anything — future
// maintenance is booked as new service orders (which may cite the contract).
// Spanish labels live in the superadmin's `model/constants/contracts/`.
export enum ContractType {
  ProgrammedMaintenance = 'programmed_maintenance',
  CorrectiveMaintenance = 'corrective_maintenance',
  PreventiveMaintenance = 'preventive_maintenance',
  Installation = 'installation',
  Rent = 'rent',
  Sell = 'sell',
  Buy = 'buy',
  Guarantee = 'guarantee',
}

// The stored document's format (13 §1.2). Narrower than "whatever was
// uploaded": the allowlist is enforced server-side at write time, and this
// enum is what the column stores. `fileMime` keeps the exact content-type for
// the download response; this is the coarse, queryable classification.
export enum ContractFileType {
  Pdf = 'pdf',
  Docx = 'docx',
  Odt = 'odt',
  Xls = 'xls',
  Xlsx = 'xlsx',
}

// Derived validity (13 §1) — computed from the dates on read, never stored.
// There is no `cancelled` state: early termination is a soft delete with a
// reason, and a lapsed contract is simply `vencido` but not deleted.
export enum ContractValidity {
  /** `validFromDate` is still in the future. */
  NotStarted = 'por_iniciar',
  /** In range, or open-ended (no `expiryDate`). */
  Active = 'vigente',
  /** Past `expiryDate`. */
  Expired = 'vencido',
}

// Contract timeline entry types — append-only audit trail (01 CP-5).
export enum ContractEventType {
  // Portal download, recorded for every fetch (no first-download-only dedup).
  // `changes` carries `{ via: 'portal' }` to distinguish from other access.
  Downloaded = 'contract_downloaded',
}

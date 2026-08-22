// The handful of built-in reason codes the BACKEND itself branches on
// (10-wms/02 §4). Every other reason is pure data: read from
// `movement_reason_defs`, rendered by label, never named in code — that is the
// whole point of reasons being a tenant-customizable entity (master plan §4).
export const REASON_CODES = {
  // Ad-hoc inbound may select it, admin-only (owner 2026-07-20, 00 §6 #4).
  // Office gets `400 use_replenishment_flow`: bulk restock stays a document.
  replenishment: 'replenishment',
  // The only reason a technician self-checkout is allowed to carry.
  relocation: 'relocation',
  // Report-material consumption + its compensations (00 §6 #5) — emitted by
  // the report-materials slice, never selectable in any dialog.
  reportBinding: 'report_binding',
  // Emitted only by a count-session apply (00 §6 #29).
  stockCount: 'stock_count',
} as const;

// Readjustment-out reasons that mean the piece is GONE rather than delivered:
// the serialized units they remove flip to `lost` (02 §4). Every other
// out-reason is a piece that left the building on purpose, so its units go
// `consumed` — out of stock either way, but the two are not the same event and
// the write-off list is what tells them apart.
export const WRITE_OFF_REASON_CODES: readonly string[] = [
  'damaged_material',
  'stock_cleaning',
  'doa',
  'scrap',
];

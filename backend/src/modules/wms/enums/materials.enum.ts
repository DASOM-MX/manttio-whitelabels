// Material tracking modes (10-wms/01 §1). Immutable once the material has any
// movement (`409 tracking_immutable`) — switching modes would orphan its
// stock representation (units vs lots vs plain balances).
export enum MaterialTracking {
  // One row per physical piece, unique serial per material (`material_units`).
  Serialized = 'serialized',
  // Batch-tracked consumables — nails, rivets, washers (added 2026-07-20,
  // owner): identity per lot number, quantity within it (`material_lots`).
  Lot = 'lot',
  // Quantity only (`stock_entries`).
  Unserialized = 'unserialized',
}

// Serialized-unit lifecycle (10-wms/01 §4): `in_stock → assigned → consumed`
// (or `→ lost` via a write-off readjustment). Consumption/loss is a STATUS
// FLIP, never a virtual location — the row keeps its last warehouse/node so
// history reads naturally. `assigned` is ACTIVE (owner 2026-07-20/21):
// inventory reserved for a visit; the reservation *columns* are deferred until
// the open mechanics in 00 §6 #10 are settled (decision 2026-08-08), but the
// status value ships so the enum never needs a migration.
export enum MaterialUnitStatus {
  InStock = 'in_stock',
  Assigned = 'assigned',
  Consumed = 'consumed',
  Lost = 'lost',
}

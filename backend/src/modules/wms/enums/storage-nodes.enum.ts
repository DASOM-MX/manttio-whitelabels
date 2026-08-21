// Storage-node types (10-wms/01 §1) — the five levels a warehouse's internal
// structure can nest through. The hierarchy rule is rank-based, not
// parent-specific: a child's rank must be STRICTLY greater than its parent's
// (levels skippable — a box directly inside a storage unit is legal), and a
// ROOT may be any type (owner 2026-07-20, 00 §6 #11: a small warehouse that is
// "just racks" doesn't need a fake unit). Ranks live in
// `constants/storage-node-rank.ts`.
//
// `Warehouse` is the TOPMOST type (owner 2026-08-18): the node that stands for
// the whole building/site, above storage units. Nothing outranks it, so the
// rank rule makes it root-only — it is rejected as anyone's child (`400
// invalid_parent_type`).
export enum StorageNodeType {
  Warehouse = 'warehouse',
  StorageUnit = 'storage_unit',
  Rack = 'rack',
  Section = 'section',
  StorageBox = 'storage_box',
}

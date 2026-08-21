import { StorageNodeType } from '../enums/storage-nodes.enum';

// Hierarchy ranks (10-wms/01 §1; zero-based per user 2026-08-08): a child's
// rank must be STRICTLY greater than its parent's (`400 invalid_parent_type`),
// levels skippable. Roots may be any type (owner 2026-07-20, 00 §6 #11) — a
// root is simply a node with no parent.
//
// `warehouse` joined as the topmost level (owner 2026-08-18), shifting the four
// original levels up by one; their order relative to each other is unchanged.
// Rank 0 + the strictly-greater rule means a `warehouse` node can only be a
// root — nothing can ever parent it.
export const STORAGE_NODE_RANK: Record<StorageNodeType, number> = {
  [StorageNodeType.Warehouse]: 0,
  [StorageNodeType.StorageUnit]: 1,
  [StorageNodeType.Rack]: 2,
  [StorageNodeType.Section]: 3,
  [StorageNodeType.StorageBox]: 4,
};

import { StorageNodeType } from '../enums/storage-nodes.enum';

// Hierarchy ranks (10-wms/01 §1; zero-based per user 2026-08-08): a child's
// rank must be STRICTLY greater than its parent's (`400 invalid_parent_type`),
// levels skippable. Roots may be any type (owner 2026-07-20, 00 §6 #11) — a
// root is simply a node with no parent.
export const STORAGE_NODE_RANK: Record<StorageNodeType, number> = {
  [StorageNodeType.StorageUnit]: 0,
  [StorageNodeType.Rack]: 1,
  [StorageNodeType.Section]: 2,
  [StorageNodeType.StorageBox]: 3,
};

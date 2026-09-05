// A warehouse's place in the two-level registry (10-wms/01 §2). DERIVED from
// `parentId`, never stored: a warehouse with no parent is a root, anything
// under one is a sub-warehouse. v1 allows exactly one level of nesting — the
// service rejects a parent that itself has a parent (`400 invalid_parent`) —
// so these two values are the whole space.
//
// Not to be confused with `StorageNodeType.Warehouse`, which is the topmost
// level of the structure *inside* a warehouse.
export enum WarehouseType {
  Warehouse = 'warehouse',
  SubWarehouse = 'sub-warehouse',
}

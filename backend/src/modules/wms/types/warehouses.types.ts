import type { AssignmentRole } from '../enums/assignments.enum';
import type { MaterialTracking, MaterialUnitStatus } from '../enums/materials.enum';
import type { StorageNodeType } from '../enums/storage-nodes.enum';
import type { WarehouseType } from '../enums/warehouses.enum';
import type { storageNodes } from '../models/storage-nodes.model';
import type { warehouses } from '../models/warehouses.model';

export type WarehouseRow = typeof warehouses.$inferSelect;
export type NewWarehouse = typeof warehouses.$inferInsert;

export type StorageNodeRow = typeof storageNodes.$inferSelect;
export type NewStorageNode = typeof storageNodes.$inferInsert;

/** What a PATCH may reach on a warehouse. Assignment is deliberately absent:
 *  it has its own endpoint (02 §2) because it carries rules — technician
 *  exclusivity, role validation — that a generic field patch shouldn't own. */
export type UpdateWarehouseFields = Partial<
  Pick<
    WarehouseRow,
    | 'name'
    | 'parentId'
    | 'address'
    | 'locationReference'
    | 'latitude'
    | 'longitude'
    | 'notes'
  >
>;

/** What a PATCH may reach on a storage node. `type` and `parentNodeId` are
 *  absent by design (01 §2): the type is immutable after create, and moving a
 *  node is out of v1 — delete it while empty and recreate it where it belongs. */
export type UpdateStorageNodeFields = Partial<
  Pick<
    StorageNodeRow,
    'name' | 'description' | 'locationReference' | 'assignedUserId' | 'assignmentRole'
  >
>;

/** The person responsible for a location, resolved at read time so the UI
 *  renders "Juan Pérez · Supervisor" without a second lookup. `role` is the
 *  assignment role (what they are to THIS location), never the user's own
 *  account role — an admin may be a warehouse's supervisor. */
export interface LocationAssigneeDTO {
  id: string;
  name: string;
  role: AssignmentRole;
}

/** A warehouse as every read returns it. `type` is derived from `parentId`
 *  (01 §2) and never stored. */
export interface WarehouseDTO {
  id: string;
  name: string;
  type: WarehouseType;
  parentId?: string;
  address?: string;
  locationReference?: string;
  latitude?: number;
  longitude?: number;
  notes?: string;
  assignedUser?: LocationAssigneeDTO;
  createdAt: string;
}

/** Per-warehouse stock summary for the registry list (02 §2).
 *
 *  `materialCount` counts DISTINCT materials present at the warehouse across
 *  all three tracking modes; `unitCount` is the total on-hand amount —
 *  unserialized balances + in-stock serialized units + lot content — summed
 *  into one number. Mixed units of measure are deliberately summed: this is a
 *  "how loaded is this place" badge, not an inventory valuation. Both count
 *  the warehouse's OWN stock only; a parent does not roll up its subs, which
 *  the list renders as their own rows anyway. */
export interface WarehouseStockSummaryDTO {
  materialCount: number;
  unitCount: number;
}

/** A registry-tree row: the warehouse, its stock summary, and its live
 *  sub-warehouses. Exactly two levels deep — `children` of a child is always
 *  empty (01 §2). */
export interface WarehouseTreeDTO extends WarehouseDTO {
  stockSummary: WarehouseStockSummaryDTO;
  children: WarehouseTreeDTO[];
}

/** A node of the structure tree inside a warehouse. `hasChildren` is what makes
 *  the frontend's `<p-tree>` lazy (04 §2) — it renders the expand arrow without
 *  loading a level nobody opened. */
export interface StorageNodeDTO {
  id: string;
  warehouseId: string;
  parentNodeId?: string;
  type: StorageNodeType;
  name: string;
  description?: string;
  locationReference?: string;
  assignedUser?: LocationAssigneeDTO;
  hasChildren: boolean;
  createdAt: string;
}

/** The material identity every stock row carries, so a stock list renders
 *  without joining the catalog client-side. */
export interface StockMaterialRefDTO {
  id: string;
  name: string;
  sku?: string;
  unit: string;
  tracking: MaterialTracking;
}

/** Where a stock row sits inside its warehouse. Absent `node` means the stock
 *  is held at warehouse level, which is legal everywhere (the node is nullable
 *  on all three stock tables). */
export interface StockLocationRefDTO {
  id: string;
  name: string;
  type: StorageNodeType;
}

/** An unserialized balance (`stock_entries`). `quantity` is a string — the
 *  column is `numeric(12,3)` and a JSON float would lose exactness. */
export interface WarehouseStockEntryDTO {
  material: StockMaterialRefDTO;
  node?: StockLocationRefDTO;
  quantity: string;
}

/** One serialized piece (`material_units`), `in_stock` only — assigned,
 *  consumed and lost units keep their last location but are not on hand. */
export interface WarehouseStockUnitDTO {
  id: string;
  serialNumber: string;
  status: MaterialUnitStatus;
  material: StockMaterialRefDTO;
  node?: StockLocationRefDTO;
}

/** One lot balance at one location (`material_lots`). `quantity` is the content
 *  (nails), `pieces` the physical packages — both dimensions travel together
 *  (01 §2, user 2026-08-08). */
export interface WarehouseStockLotDTO {
  material: StockMaterialRefDTO;
  node?: StockLocationRefDTO;
  lotNumber: string;
  quantity: string;
  pieces: number;
  expiresAt?: string;
}

/** `GET /warehouses/:id/stock` — the three tracking modes as three lists rather
 *  than one merged shape: they carry genuinely different columns, and the UI
 *  renders them as separate sections (04 §2). All three are scoped to the same
 *  optional `nodeId`. */
export interface WarehouseStockDTO {
  entries: WarehouseStockEntryDTO[];
  units: WarehouseStockUnitDTO[];
  lots: WarehouseStockLotDTO[];
}

/** A warehouse row as every read selects it: the row plus its assignee's name,
 *  joined in one go because the registry always renders "who is responsible"
 *  and a second lookup per row would be a guaranteed N+1.
 *
 *  Named here rather than in the service (`backend/CLAUDE.md` — "no inline type
 *  literals in response positions"): three functions already take it, and an
 *  inline shape cannot be imported by the fourth. */
export interface WarehouseReadRow {
  warehouse: WarehouseRow;
  assigneeName: string | null;
}

/** The assignment a write leaves on a location — the pair the DB check keeps
 *  together (`*_assignment_role_check`), so it travels as one value rather than
 *  two loose arguments that could disagree. */
export interface LocationAssignment {
  assignedUserId: string | null;
  assignmentRole: AssignmentRole | null;
}

/** What a soft delete answers with. Every `DELETE` in the module returns the
 *  same acknowledgement, so it is one named type rather than an inline
 *  `{ id: string }` repeated at each signature. */
export interface DeletedRef {
  id: string;
}

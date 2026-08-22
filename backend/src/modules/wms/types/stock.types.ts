import type { MovementType, ReadjustmentDirection } from '../enums/movements.enum';
import type { movements } from '../models/movements.model';
import type { StockLocationRefDTO, StockMaterialRefDTO } from './warehouses.types';

export type MovementRow = typeof movements.$inferSelect;
export type NewMovement = typeof movements.$inferInsert;

/** A `{ warehouseId, storageNodeId? }` pair as the operation bodies send it,
 *  after the service has proved the node belongs to the warehouse. */
export interface StockLocation {
  warehouseId: string;
  storageNodeId: string | null;
}

/** Where a movement came from / went to, resolved to names for the history
 *  table (06 §1). `node` absent = warehouse level. */
export interface MovementPlaceDTO {
  warehouse: { id: string; name: string };
  node?: StockLocationRefDTO;
}

/** Serialized detail, read from `movement_units` (01 §2). Always present as an
 *  array so the client renders from the material's tracking mode rather than
 *  from which key happens to exist — same posture as `MaterialStockDTO`. */
export interface MovementUnitRefDTO {
  id: string;
  serialNumber: string;
}

/** One journal row (06 §1). Everything optional here is optional in the
 *  journal itself: an inbound has no `from`, an unserialized movement has no
 *  `lotNumber`, only a readjustment carries a `direction`.
 *
 *  Quantities are strings — `numeric(12,3)` does not survive a JSON float. */
export interface MovementDTO {
  id: string;
  type: MovementType;
  direction?: ReadjustmentDirection;
  reason: { code: string; label: string };
  material: StockMaterialRefDTO;
  quantity?: string;
  /** Lot movements only: the physical packages that moved with the content. */
  pieces?: number;
  lotNumber?: string;
  units: MovementUnitRefDTO[];
  from?: MovementPlaceDTO;
  to?: MovementPlaceDTO;
  reportId?: string;
  replenishmentId?: string;
  countSessionId?: string;
  user: { id: string; name: string };
  notes?: string;
  createdAt: string;
}

/** Filters `GET /movements` accepts (02 §4). `warehouseId` matches EITHER side
 *  — "everything that touched this warehouse" is one question, not two. */
export interface MovementFilters {
  materialId?: string;
  warehouseId?: string;
  nodeId?: string;
  reportId?: string;
  replenishmentId?: string;
  lotNumber?: string;
  type?: MovementType;
  reason?: string;
  from?: Date;
  to?: Date;
  /** Set by the service for technicians: their own van + their own reports
   *  (02 §4). Never client-supplied. */
  technicianScope?: { userId: string; warehouseId: string | null };
}

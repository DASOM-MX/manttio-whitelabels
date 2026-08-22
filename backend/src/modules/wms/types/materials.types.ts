import type { MaterialTracking, MaterialUnitStatus } from '../enums/materials.enum';
import type { materials } from '../models/materials.model';

export type MaterialRow = typeof materials.$inferSelect;
export type NewMaterial = typeof materials.$inferInsert;

export type UpdateMaterialFields = Partial<
  Pick<MaterialRow, 'sku' | 'upc' | 'name' | 'description' | 'unit' | 'tracking' | 'minStock'>
>;

/** A material row as `GET /materials` returns it (05 §1).
 *
 *  `totalStock` and `lowStock` are DERIVED, never stored (00 §6 #24): the total
 *  is summed in SQL across whichever of the three stock tables this material's
 *  tracking mode uses, and `lowStock` is that total against `minStock`. Both are
 *  computed in the query rather than in memory, because the list filters and
 *  pages on them.
 *
 *  Quantities are strings — the columns are `numeric(12,3)` and a JSON float
 *  would not hold them exactly. */
export interface MaterialDTO {
  id: string;
  /** The tenant's internal code. */
  sku?: string;
  /** The scanned barcode — GTIN digits (added 2026-07-19). */
  upc?: string;
  name: string;
  description?: string;
  unit: string;
  tracking: MaterialTracking;
  minStock?: string;
  totalStock: string;
  /** `totalStock < minStock`. Always false when no minimum is set — a material
   *  with no threshold cannot be below it. */
  lowStock: boolean;
  createdAt: string;
}

/** Where a stock row sits. The warehouse is always known; the node is absent
 *  when the stock is held at warehouse level. */
export interface StockPlaceRefDTO {
  id: string;
  name: string;
}

export interface MaterialStockEntryDTO {
  warehouse: StockPlaceRefDTO;
  node?: StockPlaceRefDTO;
  quantity: string;
}

/** Serialized pieces. Unlike the warehouse-scoped read, this one lists units in
 *  EVERY status: the material view is where someone asks "where did that serial
 *  go?", and consumed/lost units keep their last location precisely so that
 *  question has an answer (01 §4). */
export interface MaterialUnitDTO {
  id: string;
  serialNumber: string;
  status: MaterialUnitStatus;
  warehouse: StockPlaceRefDTO;
  node?: StockPlaceRefDTO;
}

export interface MaterialLotDTO {
  lotNumber: string;
  warehouse: StockPlaceRefDTO;
  node?: StockPlaceRefDTO;
  quantity: string;
  /** Physical packages at this location (user 2026-08-08) — added to the shape
   *  05 §1 sketched, which predates the column. */
  pieces: number;
  expiresAt?: string;
}

/** `GET /materials/:id/stock` (02 §3). Only the list matching the material's
 *  tracking mode is ever populated — a material lives in exactly one of the
 *  three tables — but all three keys are always present, so the client renders
 *  from the mode rather than from which key happens to exist. */
export interface MaterialStockDTO {
  entries: MaterialStockEntryDTO[];
  units: MaterialUnitDTO[];
  lots: MaterialLotDTO[];
}

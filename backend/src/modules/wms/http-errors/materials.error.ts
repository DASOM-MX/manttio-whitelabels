/** `sku` is the tenant's INTERNAL code and is unique across live materials
 *  (`materials_sku_uidx`, partial on `deleted_at is null` — so a deleted
 *  material frees its code). Controller maps it to `409 sku_in_use`. */
export class SkuInUseError extends Error {
  constructor(public sku: string) {
    super(`sku already in use: ${sku}`);
    this.name = 'SkuInUseError';
  }
}

/** `upc` is the scanned barcode (GTIN digits, added 2026-07-19). Same partial
 *  unique, separate code — a clash here means someone already registered this
 *  physical product, which is a different conversation from an internal-code
 *  collision. Controller maps it to `409 upc_in_use`. */
export class UpcInUseError extends Error {
  constructor(public upc: string) {
    super(`upc already in use: ${upc}`);
    this.name = 'UpcInUseError';
  }
}

/** `tracking` decides WHERE a material's stock lives — `material_units`,
 *  `material_lots` or `stock_entries` (01 §2). Once the journal holds a single
 *  movement for it, switching modes would orphan every balance those movements
 *  built, so the mode is frozen for good. Controller maps it to
 *  `409 tracking_immutable`. */
export class TrackingImmutableError extends Error {
  constructor(public materialId: string) {
    super(`material ${materialId} already has movements; tracking is frozen`);
    this.name = 'TrackingImmutableError';
  }
}

/** Delete is soft and zero-stock-only (01 §2): a material still sitting on a
 *  shelf cannot leave the catalog, or the stock rows would point at something
 *  no list will ever show again. Controller maps it to
 *  `409 material_has_stock`. */
export class MaterialHasStockError extends Error {
  constructor(public materialId: string) {
    super(`material ${materialId} still holds stock`);
    this.name = 'MaterialHasStockError';
  }
}

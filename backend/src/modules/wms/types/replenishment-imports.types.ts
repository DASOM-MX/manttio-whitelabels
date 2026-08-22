// Shapes of the jsonb columns on `replenishment_imports` (10-wms/01 §2).

// One sniffed column of the uploaded sheet, captured at upload for the field
// mapper. `id` is per-import — the stored mapping memory keys by header text
// instead (`wms_settings`, `wms.last_replenishment_mapping`).
export interface DetectedField {
  id: string;
  header: string;
  samples: string[];
}

// The user's field mapping, submitted at /process — DetectedField ids by
// target. `lot` + `expiry` are the Lote/Caducidad targets (owner 2026-07-20);
// `pieces` is the optional package-count target for lot materials (user
// 2026-08-08).
export interface ReplenishmentFieldMapping {
  sku: string;
  quantity?: string;
  pieces?: string;
  serial?: string;
  lot?: string;
  expiry?: string;
}

// The mapper-prefill memory stored in `wms_settings` under
// `wms.last_replenishment_mapping` — by HEADER TEXT, not field id (ids are
// per-import). Upserted on every successful /process; the upload endpoint
// returns a field-id-resolved `suggestedMapping` when headers match (07 §2).
export interface LastReplenishmentMapping {
  headers: string[];
  mapping: {
    sku: string;
    quantity?: string;
    pieces?: string;
    serial?: string;
    lot?: string;
    expiry?: string;
  };
}

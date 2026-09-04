import type { ImportEventType, ReplenishmentImportStatus, RowErrorCode } from '../enums/replenishment-imports.enum';
import type {
  replenishmentImportEvents,
  replenishmentImportRows,
  replenishmentImports,
} from '../models/replenishment-imports.model';

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

// ── row aliases + response shapes (02 §6) ──────────────────────────────────

export type ReplenishmentImportRow = typeof replenishmentImports.$inferSelect;
export type NewReplenishmentImport = typeof replenishmentImports.$inferInsert;
export type ImportStagedRow = typeof replenishmentImportRows.$inferSelect;
export type NewImportStagedRow = typeof replenishmentImportRows.$inferInsert;
export type ImportEventRow = typeof replenishmentImportEvents.$inferSelect;
export type NewImportEvent = typeof replenishmentImportEvents.$inferInsert;

export type UpdateImportFields = Partial<
  Pick<ReplenishmentImportRow, 'evidencePhotos' | 'notes'>
>;

export type UpdateStagedRowFields = Partial<
  Pick<
    ImportStagedRow,
    'materialId' | 'quantity' | 'pieces' | 'serial' | 'lot' | 'lotExpiresAt' | 'storageNodeId' | 'raw' | 'error'
  >
>;

/** What `POST /replenishments/imports` answers: enough for the mapper screen
 *  and nothing more — the file itself is not read past its header. */
export interface ImportUploadDTO {
  importId: string;
  fileName: string;
  fields: DetectedField[];
  /** Present only when the remembered mapping's headers match this file's,
   *  resolved from header text to THIS import's field ids (02 §6). */
  suggestedMapping?: ReplenishmentFieldMapping;
}

/** One staged line as the review table renders it (07 §2). `material` is null
 *  while the code is unresolved — that IS the `unknown_sku` case. */
export interface ImportStagedRowDTO {
  line: number;
  raw: Record<string, unknown>;
  material?: { id: string; name: string; sku?: string; unit: string; tracking: string };
  quantity?: string;
  pieces?: number;
  serial?: string;
  lot?: string;
  expiresAt?: string;
  storageNode?: { id: string; name: string };
  error?: RowErrorCode;
  /** Derived from `error`: an unprocessable row promotes as a flagged item
   *  instead of blocking approval (02 §6). */
  unprocessable: boolean;
}

/** The one-shot status read — the same payload the SSE stream will push. */
export interface ImportStatusDTO {
  id: string;
  status: ReplenishmentImportStatus;
  fileName: string;
  warehouse: { id: string; name: string };
  fields: DetectedField[];
  mapping?: ReplenishmentFieldMapping;
  submissionSnapshot?: string;
  progress: { total?: number; processed: number; errors: number };
  error?: string;
  /** Derived from the latest `rejected` event, so office sees the feedback
   *  without loading the whole audit (02 §6). */
  rejectionComment?: string;
  evidencePhotos: string[];
  notes?: string;
  /** Present once the consumer has staged them. */
  rows?: ImportStagedRowDTO[];
  createdAt: string;
}

/** One line of the lifecycle audit (`GET .../audit`). */
export interface ImportEventDTO {
  type: ImportEventType;
  /** Absent for the system events the queue consumer emits. */
  actor?: { id: string; name: string };
  line?: number;
  reason?: string;
  details: Record<string, unknown>;
  createdAt: string;
}

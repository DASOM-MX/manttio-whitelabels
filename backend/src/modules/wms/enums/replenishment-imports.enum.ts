// Replenishment import lifecycle (10-wms/01 §1, added 2026-07-19, owner ask).
// The DB row is the single source of truth the frontend listens to (SSE stream
// + one-shot reads — 02 §6); only the queue consumer (11) writes
// `processing → ready/failed`, only the approval transaction writes
// `confirmed`. Terminal states: `failed`, `confirmed`, `stale`, `cancelled`.
export enum ReplenishmentImportStatus {
  // File stored in R2, fields detected, awaiting mapping.
  Uploaded = 'uploaded',
  // Mapping submitted, queue message sent, waiting for the consumer to claim.
  Queued = 'queued',
  // Delivered to the queue consumer, job running.
  Processing = 'processing',
  // Rows parsed + validated, preview available — awaiting approval.
  Ready = 'ready',
  // Owner/admin sent it back with a comment (2026-07-20) — office adjusts,
  // then resubmit → ready. NON-terminal, still in-flight (staging intact).
  Rejected = 'rejected',
  // Whole-file failure or max queue attempts (import.error set).
  Failed = 'failed',
  // Replenishment document created from this import.
  Confirmed = 'confirmed',
  // Benign abandon / superseded; staging cron-swept (11 §4).
  Stale = 'stale',
  // Owner-only full cancel (2026-07-20): staging truncated + record closed,
  // reason required.
  Cancelled = 'cancelled',
}

// Whole-lifecycle audit events (owner 2026-07-20, 00 §6 #20) — one
// `replenishment_import_events` row per step, start button → confirmation.
export enum ImportEventType {
  // Register/upload — the "start".
  Created = 'created',
  MappingSubmitted = 'mapping_submitted',
  // System actor (queue consumer): NULL `actor_user_id`.
  ProcessingStarted = 'processing_started',
  Processed = 'processed',
  ProcessingFailed = 'processing_failed',
  RowUpdated = 'row_updated',
  // Owner/admin only, reason required.
  RowRemoved = 'row_removed',
  EvidenceUpdated = 'evidence_updated',
  NotesUpdated = 'notes_updated',
  // Owner/admin sent it back — `reason` carries the comment office reads.
  Rejected = 'rejected',
  // Office re-requested approval after adjusting.
  Resubmitted = 'resubmitted',
  Stale = 'stale',
  // Owner-only full cancel — reason required.
  Cancelled = 'cancelled',
  // Admin/owner confirmation → document created.
  Approved = 'approved',
}

// Why one staged row cannot be promoted as-is (10-wms/02 §6). Written by the
// queue consumer at parse time and re-derived by the row PATCH, which is why
// the rules live in one shared module (`helpers/import-rows.helpers.ts`)
// rather than being spelled twice.
//
// TWO CLASSES, and the difference is what approval does with them:
//   - FIXABLE (everything not listed as unprocessable) GATES approval —
//     `409 import_has_errors` until the row is PATCHed clean.
//   - UNPROCESSABLE promotes as a FLAGGED item: recorded in the document and
//     visible for provider follow-up, but no movement, no unit, no stock
//     effect (owner 2026-07-20).
export enum RowErrorCode {
  // No material matched the mapped code by SKU or by UPC.
  UnknownSku = 'unknown_sku',
  // Missing, unparseable, or non-positive quantity.
  BadQuantity = 'bad_quantity',
  MissingSerial = 'missing_serial',
  // A lot-tracked material with no value in the mapped lot field.
  MissingLot = 'missing_lot',
  // The mapped expiry field held something that is not a date.
  BadExpiry = 'bad_expiry',
  // A serialized row is one physical piece, so a quantity other than 1 means
  // the sheet is describing something the row cannot represent.
  QuantityOnSerialized = 'quantity_on_serialized',
  // Unprocessable — the serial repeats within the file (first occurrence
  // processes, later ones are flagged).
  DuplicateSerial = 'duplicate_serial',
  // Unprocessable — the serial is already claimed in the database.
  SerialExists = 'serial_exists',
}

import { ReasonContext } from '../enums/movements.enum';

// The 14 built-in movement reasons (10-wms/01 §5 — semantics confirmed
// 2026-07-05; `scrap` + `lot_expired` added 2026-07-20; `stock_count` added
// 2026-07-21). Seeded idempotently by the WMS migration (insert-if-missing by
// `code`) with `built_in: true` — fully locked: no label edits, no
// deactivation. This constant is the TS mirror the seed-verification test
// (01 CP-2) checks the DB against; keep it and the migration INSERT in sync.
//
// `requiresNote` is 00 §6 #23 (accepted 2026-07-20): the readjust/consumption
// validators reject a blank note when the chosen reason sets it
// (`400 note_required`) — forced for the two write-off reasons.
export interface MovementReasonSeed {
  code: string;
  label: string;
  appliesTo: ReasonContext[];
  requiresNote: boolean;
}

export const MOVEMENT_REASON_SEEDS: MovementReasonSeed[] = [
  // Ad-hoc inbound may select it ADMIN-ONLY (owner 2026-07-20, 00 §6 #4);
  // office/technician stay excluded → `400 use_replenishment_flow`.
  { code: 'replenishment', label: 'Reabastecimiento', appliesTo: [ReasonContext.Inbound], requiresNote: false },
  { code: 'refund_by_client', label: 'Devolución de cliente', appliesTo: [ReasonContext.Inbound, ReasonContext.ReadjustmentIn], requiresNote: false },
  { code: 'repair', label: 'Reparación', appliesTo: [ReasonContext.ReadjustmentOut, ReasonContext.ReadjustmentIn], requiresNote: false },
  { code: 'relocation', label: 'Reubicación', appliesTo: [ReasonContext.Transfer], requiresNote: false },
  // Report-material consumption + its compensating corrections stay under one
  // code (00 §6 #5); never user-selectable in any dialog.
  { code: 'report_binding', label: 'Consumo en reporte', appliesTo: [ReasonContext.Consumption, ReasonContext.ReadjustmentIn, ReasonContext.ReadjustmentOut], requiresNote: false },
  { code: 'returned_to_client', label: 'Entregado al cliente', appliesTo: [ReasonContext.ReadjustmentOut], requiresNote: false },
  { code: 'return_to_provider', label: 'Devolución a proveedor (cambio)', appliesTo: [ReasonContext.ReadjustmentOut], requiresNote: false },
  { code: 'refund_to_provider', label: 'Devolución a proveedor (reembolso)', appliesTo: [ReasonContext.ReadjustmentOut], requiresNote: false },
  { code: 'damaged_material', label: 'Material dañado', appliesTo: [ReasonContext.ReadjustmentOut], requiresNote: false },
  { code: 'stock_cleaning', label: 'Depuración de inventario', appliesTo: [ReasonContext.ReadjustmentOut], requiresNote: false },
  { code: 'doa', label: 'Dañado de origen (DOA)', appliesTo: [ReasonContext.ReadjustmentOut], requiresNote: false },
  // Scrapped/waste material (owner 2026-07-20); units it removes flip to `lost`.
  { code: 'scrap', label: 'Merma', appliesTo: [ReasonContext.ReadjustmentOut], requiresNote: true },
  // Manual FEFO instrument (owner 2026-07-20): write-off of an expired lot.
  { code: 'lot_expired', label: 'Lote vencido', appliesTo: [ReasonContext.ReadjustmentOut], requiresNote: true },
  // Physical-count reconciliation (owner 2026-07-21, 00 §6 #29): both
  // directions; never user-selectable outside the count-apply flow.
  { code: 'stock_count', label: 'Conteo físico', appliesTo: [ReasonContext.ReadjustmentIn, ReasonContext.ReadjustmentOut], requiresNote: false },
];

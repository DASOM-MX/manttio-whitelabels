// Physical-count reconciliation session states (10-wms/01 §1, added 2026-07-21,
// owner, 00 §6 #29). A session is a TIME WINDOW, not a movement type — applying
// it emits plain `readjustment` movements under the locked `stock_count`
// reason. Append-only: immutable after `applied`/`cancelled`; a re-count is a
// new session.
export enum StockCountStatus {
  Open = 'open',
  Applied = 'applied',
  Cancelled = 'cancelled',
}

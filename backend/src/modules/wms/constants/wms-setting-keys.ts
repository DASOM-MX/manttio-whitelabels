// Keys of the `wms_settings` KV store (10-wms/01 §2; scoped WMS-local
// 2026-08-08 — see `models/wms-settings.model.ts`). New settings = new rows
// with a new key here, never new columns.
export const WMS_SETTING_KEYS = {
  // Last successful field mapping, stored by HEADER TEXT (field ids are
  // per-import) — the mapper-prefill memory (owner 2026-07-19, 07 §2 step 3).
  lastReplenishmentMapping: 'wms.last_replenishment_mapping',
  // Days an unresolved reservation is held before the daily cron auto-returns
  // it to its source warehouse (owner 2026-07-21, 00 §6 #10).
  reservationAutoReturnDays: 'wms.reservation_auto_return_days',
  // The CMS-manager who receives replenishment approval/failure warnings
  // (owner 2026-07-20; 11 §2 step 4). Namespaced `notifications.` because the
  // key belongs to that domain — it lodges in this store only until the
  // notifications module grows one of its own (02 §1).
  notificationsManagerUserId: 'notifications.manager_user_id',
  // Whether a physical-count session hides system quantities from the counter
  // (owner 2026-07-21, 00 §6 #29). Snapshotted onto the session at open.
  stockCountBlind: 'wms.stock_count_blind',
} as const;

// Defaults applied by the reader when the row is absent — provisioning seeds
// nothing; an unset key must behave like its default.
export const WMS_SETTING_DEFAULTS = {
  reservationAutoReturnDays: 3,
  stockCountBlind: true,
} as const;

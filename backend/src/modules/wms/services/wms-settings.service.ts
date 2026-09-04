import type { DbOrTx } from '../../database/client';
import { WMS_SETTING_DEFAULTS, WMS_SETTING_KEYS } from '../constants/wms-setting-keys';
import { findSetting, upsertSetting } from '../repository/wms-settings.repository';

// The WMS key-value store's accessors (10-wms/02 §1, scoped WMS-local
// 2026-08-08). Deliberately NO controller in v1: these settings are
// backend-internal, and an API lands only when a user-facing setting appears.
//
// An absent row must behave exactly like its default — provisioning seeds
// nothing, so "never written" and "written to the default" have to be
// indistinguishable to every reader.

export const getSetting = async <T>(db: DbOrTx, key: string, fallback: T): Promise<T> => {
  const row = await findSetting(db, key);
  return row === null ? fallback : (row.value as T);
};

export const setSetting = async <T>(db: DbOrTx, key: string, value: T): Promise<T> => {
  const row = await upsertSetting(db, key, value);
  return row.value as T;
};

/** Named readers for the keys that HAVE a default, so the default is bound to
 *  the key in one place instead of being re-typed at each call site. */
export const getStockCountBlind = (db: DbOrTx) =>
  getSetting<boolean>(db, WMS_SETTING_KEYS.stockCountBlind, WMS_SETTING_DEFAULTS.stockCountBlind);

export const getReservationAutoReturnDays = (db: DbOrTx) =>
  getSetting<number>(
    db,
    WMS_SETTING_KEYS.reservationAutoReturnDays,
    WMS_SETTING_DEFAULTS.reservationAutoReturnDays,
  );

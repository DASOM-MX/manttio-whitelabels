import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../../database/client';
import { wmsSettings } from '../models/wms-settings.model';

// The WMS key-value store (10-wms/01 §2, scoped WMS-local 2026-08-08). New
// settings are new ROWS under a new key in `constants/wms-setting-keys.ts` —
// never new columns, which is what keeps this two functions wide.

export const findSetting = async (db: DbOrTx, key: string) => {
  const [row] = await db.select().from(wmsSettings).where(eq(wmsSettings.key, key)).limit(1);
  return row ?? null;
};

/** Upsert by key. `unknown` rather than a typed value: the column is jsonb and
 *  every key has its own shape — the typing lives at the accessor, above. */
export const upsertSetting = async (db: DbOrTx, key: string, value: unknown) => {
  const [row] = await db
    .insert(wmsSettings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: wmsSettings.key,
      set: { value, updatedAt: new Date() },
    })
    .returning();
  if (!row) throw new Error('upsert wms_settings returned no row');
  return row;
};

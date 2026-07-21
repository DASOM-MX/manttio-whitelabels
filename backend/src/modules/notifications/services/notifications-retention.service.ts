// The daily retention sweep body, called by the Worker's scheduled() handler
// (plan §2.4) — the codebase's first cron. Hard-deletes notification rows
// older than the retention window: the one owner-sanctioned exception to the
// no-hard-deletes rule (transient per-user delivery copies, nothing FKs to
// them, the permanent record of the underlying event lives in the
// originating module's own log — plan §0).

import type { Db } from '../../database/client';
import type { Env } from '../../../env';
import { deleteOlderThanMonths } from '../repository/notifications.repository';

const DEFAULT_RETENTION_MONTHS = 8;

export const sweepExpiredNotifications = async (db: Db, env: Env): Promise<number> => {
  const parsed = Number(env.NOTIFICATIONS_RETENTION_MONTHS);
  const months = Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_RETENTION_MONTHS;
  const swept = await deleteOlderThanMonths(db, months);
  console.log(`notifications retention: swept ${swept} row(s) older than ${months} months`);
  return swept;
};

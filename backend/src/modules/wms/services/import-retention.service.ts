import type { Env } from '../../../env';
import type { Db } from '../../database/client';
import { deleteStagedRowsOfImport } from '../repository/replenishment-import-rows.repository';
import {
  listSweepableImports,
  updateImportRow,
} from '../repository/replenishment-imports.repository';

// The daily retention sweep (10-wms/11 §4). Imports that never reached approval
// leave two kinds of leftover: the staged binary in `manttio-wms-sheets` and
// the staged rows. Both are disposable by design — a source file is a COPY the
// tenant still holds, and staging is scratch — so a stale failed import is
// re-uploaded, never recovered.
//
// The import HEADER is not touched. It keeps the file name, the submission
// snapshot and the event log, which is the whole point of it outliving its data.

const DEFAULT_RETENTION_DAYS = 30;

const retentionDays = (env: Env): number => {
  const configured = Number(env.WMS_IMPORT_RETENTION_DAYS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_RETENTION_DAYS;
};

export const sweepAbandonedImports = async (db: Db, env: Env): Promise<number> => {
  const cutoff = new Date(Date.now() - retentionDays(env) * 24 * 60 * 60 * 1000);
  const stale = await listSweepableImports(db, cutoff);

  let swept = 0;
  for (const imported of stale) {
    try {
      // Binary first, then the rows: R2 has no transaction, and a delete that
      // ran without its bookkeeping is recoverable on the next pass, whereas
      // bookkeeping without the delete leaks the object forever.
      if (imported.fileDeletedAt === null) {
        await env.MANTTIO_WMS_SHEETS.delete(imported.fileKey);
        await updateImportRow(db, imported.id, { fileDeletedAt: new Date() });
      }
      await deleteStagedRowsOfImport(db, imported.id);
      swept += 1;
    } catch (err) {
      // One bad import must not stop the sweep; the next run retries it.
      console.error(`wms retention sweep failed for import ${imported.id}:`, err);
    }
  }
  return swept;
};

import type { Db, DbOrTx } from '../../database/client';

/** The choreography all three document routes share (04 §2b): `find` and
 *  `record` run in one transaction, so the audit row commits before a byte is
 *  produced — a download that cannot be recorded is never served. `serve` runs
 *  after the commit; rendering a PDF or fetching from R2 has no business
 *  holding a transaction open. A null `find` records nothing and 404s. */
export const recordedDownload = async <TRow, TOut>(
  db: Db,
  find: (tx: DbOrTx) => Promise<TRow | null>,
  record: (tx: DbOrTx, row: TRow) => Promise<unknown>,
  serve: (row: TRow) => Promise<TOut | null>,
): Promise<TOut | null> => {
  const row = await db.transaction(async (tx) => {
    const found = await find(tx);
    if (!found) return null;
    await record(tx, found);
    return found;
  });
  return row ? serve(row) : null;
};

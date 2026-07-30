import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';

// We use the WebSocket driver (not neon-http) so we have real Postgres
// transactions for the atomic createReport flow (counter + header + details).
export const createDb = (databaseUrl: string) => {
  const pool = new Pool({ connectionString: databaseUrl });
  // A pool with no `error` listener is a **credential leak**, not just noise.
  // When the runtime drops an idle socket — every Worker eviction, every test
  // teardown — `pg` re-emits it on the pool, and an unhandled `error` event
  // makes EventEmitter throw `Unhandled error.` with the whole client attached.
  // Whatever serializes that (Vitest, `wrangler tail`) then prints
  // `connectionParameters.password` and `config.connectionString` in cleartext.
  // Swallowing here is safe: this event only ever reports a *dead idle* socket.
  // A connection that fails while a query needs it rejects that query's promise
  // on its own path, which is where callers already handle it.
  pool.on('error', () => {});
  return drizzle(pool, { schema });
};

export type Db = ReturnType<typeof createDb>;

/** The handle Drizzle hands a `db.transaction(cb)` callback — same query
 *  surface as `Db`, but enlisted in the caller's transaction. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** For repository helpers that must be able to run *inside* someone else's
 *  transaction as well as standalone. The order timeline is the reason it
 *  exists: every `service_order_events` append has to share the transaction of
 *  the state change it describes, or the audit trail can drift from reality
 *  (19 §7). */
export type DbOrTx = Db | Tx;

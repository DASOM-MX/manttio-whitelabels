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

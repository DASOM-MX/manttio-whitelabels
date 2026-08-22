// Postgres SQLSTATE codes we react to. See https://www.postgresql.org/docs/current/errcodes-appendix.html
const FK_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';

const codeOf = (err: unknown): string | null => {
  if (typeof err !== 'object' || err === null) return null;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
};

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export const isForeignKeyViolation = (err: unknown) =>
  codeOf(err) === FK_VIOLATION || /violates foreign key/i.test(messageOf(err));

export const isUniqueViolation = (err: unknown) =>
  codeOf(err) === UNIQUE_VIOLATION || /violates unique constraint|duplicate key/i.test(messageOf(err));

/** Which unique index a `23505` came from. Two partial uniques on one table —
 *  `materials_sku_uidx` and `materials_upc_uidx` — mean "duplicate" is not a
 *  precise enough answer: the caller has to say WHICH code is taken. Reading it
 *  off the error keeps that race-safe, where a pre-check would not.
 *
 *  `constraint` is populated by the driver on unique violations; the message
 *  fallback covers a driver that only stringifies it. */
export const uniqueConstraintName = (err: unknown): string | null => {
  if (typeof err === 'object' && err !== null) {
    const constraint = (err as { constraint?: unknown }).constraint;
    if (typeof constraint === 'string') return constraint;
  }
  const match = /unique constraint "([^"]+)"/i.exec(messageOf(err));
  return match?.[1] ?? null;
};

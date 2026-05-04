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

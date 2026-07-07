// Canonical JSON serialization (recursively sorted keys, `undefined` values
// skipped like JSON.stringify). Needed for draft-vs-published comparison:
// Postgres jsonb does NOT preserve object key order, so a naive
// JSON.stringify compare between a freshly built doc and a round-tripped one
// produces false "unpublished changes".
export const stableStringify = (value: unknown): string => {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
};

export const jsonEquals = (a: unknown, b: unknown): boolean =>
  stableStringify(a) === stableStringify(b);

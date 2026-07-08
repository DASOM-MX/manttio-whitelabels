// The v1.1 section-copy groups reach us validator-free (backend accepts empty
// strings), so a field can be present-but-blank. `filled` normalizes that:
// non-blank string in, otherwise undefined — callers chain `?? fallback`.
export const filled = (value: string | undefined): string | undefined =>
  value && value.trim() ? value : undefined;

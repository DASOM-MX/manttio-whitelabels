// Value formatters for rendering captured report data in PDF and email.

export const formatBoolean = (v: unknown) => (v === true ? 'Sí' : v === false ? 'No' : '—');

export const formatScalar = (v: unknown): string => {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return formatBoolean(v);
  if (typeof v === 'string') return v.trim() === '' ? '—' : v;
  return String(v);
};

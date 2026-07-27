// Atomic per-day order folio generator (19 §1). The sequence comes from the
// `service_order_counters` upsert inside the createServiceOrder transaction —
// same mechanics as report ids, different prefix and counter table.

export const formatServiceOrderFolio = (day: Date, sequence: number) => {
  const yyyy = day.getUTCFullYear();
  const mm = String(day.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(day.getUTCDate()).padStart(2, '0');
  const seq = String(sequence).padStart(4, '0');
  return `OS-${yyyy}${mm}${dd}-${seq}`;
};

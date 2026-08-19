// Atomic per-day contract folio generator (13 §1). The sequence comes from the
// `contract_counters` upsert inside the createContract transaction — same
// mechanics as report ids and order folios, different prefix and counter table.

export const formatContractFolio = (day: Date, sequence: number) => {
  const yyyy = day.getUTCFullYear();
  const mm = String(day.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(day.getUTCDate()).padStart(2, '0');
  const seq = String(sequence).padStart(4, '0');
  return `CON-${yyyy}${mm}${dd}-${seq}`;
};

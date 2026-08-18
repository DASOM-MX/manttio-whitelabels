// Atomic per-day visit code generator (12 §1, owner 2026-08-02). The sequence
// comes from the `visit_counters` upsert inside the create transaction — same
// mechanics as the order folio and report id, different prefix and counter
// table.

/** `V-YYYYMMDD-NNNN`. Short enough to read over the phone, sortable as text,
 *  and prefix-searchable by year (`V-2026`) or by day (`V-20260802`) — which is
 *  the whole reason the date leads. */
export const formatVisitCode = (day: Date, sequence: number) => {
  const yyyy = day.getUTCFullYear();
  const mm = String(day.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(day.getUTCDate()).padStart(2, '0');
  const seq = String(sequence).padStart(4, '0');
  return `V-${yyyy}${mm}${dd}-${seq}`;
};

// Atomic per-day quotation folio (20 §1). Sequence comes from the
// `quotation_counters` upsert inside the createQuotation transaction — same
// mechanics as `report_counters`/`formatReportId`, and deliberately its own
// counter table: quotes and reports are different documents and a shared
// sequence would make gaps in each look like lost records.

export const formatQuotationFolio = (day: Date, sequence: number) => {
  const yyyy = day.getUTCFullYear();
  const mm = String(day.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(day.getUTCDate()).padStart(2, '0');
  const seq = String(sequence).padStart(4, '0');
  return `COT-${yyyy}${mm}${dd}-${seq}`;
};

// UTC day key for the counter row, matching `report_counters.day`. UTC and not
// the customer's timezone: the folio is an internal document number, so a
// stable global sequence beats one that could repeat across a DST boundary.
export const folioDayKey = (day: Date) => day.toISOString().slice(0, 10);

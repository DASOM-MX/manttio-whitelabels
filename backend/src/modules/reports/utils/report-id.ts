// Atomic per-day report id generator. Sequence comes from the `report_counters` upsert
// in the createReport transaction (see repository/reports.repository.ts).

export const formatReportId = (day: Date, sequence: number) => {
  const yyyy = day.getUTCFullYear();
  const mm = String(day.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(day.getUTCDate()).padStart(2, '0');
  const seq = String(sequence).padStart(4, '0');
  return `R-${yyyy}${mm}${dd}-${seq}`;
};

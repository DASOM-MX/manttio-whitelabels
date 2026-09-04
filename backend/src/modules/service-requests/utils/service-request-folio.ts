/**
 * Service request folio format: `SOL-YYYYMMDD-NNNN` (e.g., `SOL-20260828-0007`).
 * Mirrors quotation folio format but with SOL prefix (for "solicitud").
 */

// UTC day key for the counter row, matching how quotation_counters.day works.
// Returns ISO date string slice (YYYY-MM-DD).
export const folioDayKey = (date: Date): string => date.toISOString().slice(0, 10);

export const formatServiceRequestFolio = (date: Date, number: number): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const seq = String(number).padStart(4, '0');
  return `SOL-${year}${month}${day}-${seq}`;
};

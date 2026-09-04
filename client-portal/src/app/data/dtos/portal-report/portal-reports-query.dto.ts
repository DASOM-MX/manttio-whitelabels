/** `GET /portal/reports` query (backend `portalReportsQuerySchema`, 04 §3):
 *  date range, equipment, free text. No `customerId` — the scope is the
 *  token's. */
export interface PortalReportsQuery {
  page?: number;
  limit?: number;
  search?: string;
  equipmentId?: string;
  dateFrom?: string;
  dateTo?: string;
}

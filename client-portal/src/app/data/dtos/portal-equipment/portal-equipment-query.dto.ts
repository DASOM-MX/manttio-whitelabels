/** `GET /portal/equipment` query (backend `portalEquipmentQuerySchema`,
 *  04 §7): free text, location. No status filter — retired units stay
 *  visible alongside active ones. No `customerId` — the scope is the
 *  token's. */
export interface PortalEquipmentQuery {
  page?: number;
  limit?: number;
  search?: string;
  location?: string;
}

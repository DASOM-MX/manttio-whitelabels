/** A unit as the customer sees it (backend `PortalEquipmentListItem`,
 *  04 §7). `lastServiceDate` is derived server-side from the newest
 *  *released* report against the unit and arrives as a plain ISO string —
 *  `null` means the unit has never had a released service, and must render
 *  as such rather than a blank cell. Acquisition cost, internal maintenance
 *  scheduling and the WMS link are never sent. */
export interface PortalEquipmentListItem {
  id: string;
  name: string | null;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  location: string | null;
  lastServiceDate: string | null;
}

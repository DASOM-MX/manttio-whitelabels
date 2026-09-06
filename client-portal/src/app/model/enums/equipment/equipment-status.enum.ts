/** Equipment lifecycle — mirrors the backend `EquipmentStatus`. Retired
 *  units stay visible in the portal (04 §2 excludes soft-deleted rows only)
 *  — a decommissioned unit's history is exactly what the section is for. */
export enum EquipmentStatus {
  Active = 'active',
  Retired = 'retired',
}

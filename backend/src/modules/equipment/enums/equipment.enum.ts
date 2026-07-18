// Equipment lifecycle status (11 §1). A unit that stopped being serviced is
// `retired`, never deleted (soft delete is reserved for created-by-mistake rows).
export enum EquipmentStatus {
  Active = 'active',
  Retired = 'retired',
}

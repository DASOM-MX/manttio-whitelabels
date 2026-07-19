// Equipment lifecycle status (11 §1). A unit that stopped being serviced is
// `retired`, never deleted (soft delete is reserved for created-by-mistake rows).
export enum EquipmentStatus {
  Active = 'active',
  Retired = 'retired',
}

// How the unit came to be at the client (11): `externo` = pre-existing unit we
// only service; `venta` = we sold it; `renta` = we rent it to them.
export enum EquipmentOrigin {
  Externo = 'externo',
  Venta = 'venta',
  Renta = 'renta',
}

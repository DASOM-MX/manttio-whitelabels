/** Equipment is client-scoped, so a contract may only cover units belonging to
 *  *its* customer (13 §1). A mismatch is a conflict rather than a validation
 *  failure — the ids are well-formed uuids that exist, just on another client,
 *  which usually means a stale picker rather than a malformed request.
 *  Controller maps it to `409 equipment_customer_mismatch`. */
export class ContractEquipmentMismatchError extends Error {
  constructor(public equipmentIds: string[]) {
    super(`equipment does not belong to this contract's customer: ${equipmentIds.join(', ')}`);
    this.name = 'ContractEquipmentMismatchError';
  }
}

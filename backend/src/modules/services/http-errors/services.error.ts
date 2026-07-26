/** `internalServiceCode` is unique across the live catalog (18 §1), so a
 *  duplicate is a conflict rather than a validation failure — the payload is
 *  well-formed, the catalog just already has that code. Controller maps it to
 *  `409 internal_service_code_in_use`. */
export class ServiceCodeInUseError extends Error {
  constructor(public code: string) {
    super(`internal service code already in use: ${code}`);
    this.name = 'ServiceCodeInUseError';
  }
}

/** How a `service_created` row came to exist (18 §6.1). `Clone` (CP-5) and
 *  `Import` (CP-6) are declared ahead of their checkpoints — parity with the
 *  backend enum, which is the contract those checkpoints fill. */
export enum ServiceCreatedVia {
  Form = 'form',
  Clone = 'clone',
  Import = 'import',
}

/** What kind of agreement a contract is (13 §1.1) — parity with the backend
 *  `ContractType`. A fixed vocabulary, not free text: the list filters on it and
 *  the type tag is how a filing screen stays readable. */
export enum ContractType {
  ProgrammedMaintenance = 'programmed_maintenance',
  CorrectiveMaintenance = 'corrective_maintenance',
  PreventiveMaintenance = 'preventive_maintenance',
  Installation = 'installation',
  Rent = 'rent',
  Sell = 'sell',
  Buy = 'buy',
  Guarantee = 'guarantee',
}

/** What kind of agreement a contract is (04 §4) — mirrors the backend
 *  `ContractType`. A fixed vocabulary: the list filters on it. */
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

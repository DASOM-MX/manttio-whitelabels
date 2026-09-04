/** Where a contract sits against its dates (04 §4) — mirrors the backend
 *  `ContractValidity`. Derived server-side, never stored and never
 *  recomputed here: the client renders what it is told. */
export enum ContractValidity {
  NotStarted = 'por_iniciar',
  Active = 'vigente',
  Expired = 'vencido',
}

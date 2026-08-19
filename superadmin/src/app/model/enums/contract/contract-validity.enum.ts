/** Where a contract sits against its dates (13 §1) — parity with the backend
 *  `ContractValidity`.
 *
 *  **Derived server-side, never stored** and never recomputed here: the backend
 *  owns the comparison (`current_date` against `validFromDate`/`expiryDate`) so
 *  the list filter and the pill can never disagree. The client renders what it
 *  is told. */
export enum ContractValidity {
  NotStarted = 'por_iniciar',
  Active = 'vigente',
  Expired = 'vencido',
}

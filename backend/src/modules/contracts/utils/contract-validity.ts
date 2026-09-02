import { ContractValidity } from '../enums/contracts.enum';
import type { ContractRow } from '../types/contracts.types';

// Derived from the dates, never stored (13 §1) — mirrors `validityFilter` in the
// repository, which is the SQL half of the same rule. `today` is the caller's,
// so nothing here reads a clock.
export const validityOf = (row: ContractRow, today: string): ContractValidity => {
  if (row.validFromDate > today) return ContractValidity.NotStarted;
  if (row.expiryDate && row.expiryDate < today) return ContractValidity.Expired;
  return ContractValidity.Active;
};

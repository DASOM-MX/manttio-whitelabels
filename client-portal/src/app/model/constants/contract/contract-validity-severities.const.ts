import { ContractValidity } from '../../enums/contract/contract-validity.enum';

/** `vencido` is a warning, not a failure — an expired contract is a normal
 *  archival state, so it reads amber rather than danger red. */
export const CONTRACT_VALIDITY_SEVERITIES: Record<ContractValidity, 'success' | 'info' | 'warn'> = {
  [ContractValidity.NotStarted]: 'info',
  [ContractValidity.Active]: 'success',
  [ContractValidity.Expired]: 'warn',
};

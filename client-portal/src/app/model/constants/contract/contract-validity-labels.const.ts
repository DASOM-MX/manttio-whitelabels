import { ContractValidity } from '../../enums/contract/contract-validity.enum';

export const CONTRACT_VALIDITY_LABELS: Record<ContractValidity, string> = {
  [ContractValidity.NotStarted]: 'Por iniciar',
  [ContractValidity.Active]: 'Vigente',
  [ContractValidity.Expired]: 'Vencido',
};

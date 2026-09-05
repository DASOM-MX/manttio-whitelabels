import { ContractType } from '../../enums/contract/contract-type.enum';

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  [ContractType.ProgrammedMaintenance]: 'Mantenimiento programado',
  [ContractType.CorrectiveMaintenance]: 'Mantenimiento correctivo',
  [ContractType.PreventiveMaintenance]: 'Mantenimiento preventivo',
  [ContractType.Installation]: 'Instalación',
  [ContractType.Rent]: 'Renta',
  [ContractType.Sell]: 'Venta',
  [ContractType.Buy]: 'Compra',
  [ContractType.Guarantee]: 'Garantía',
};

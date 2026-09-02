import type { ContractRow } from '../../contracts/types/contracts.types';
import { validityOf } from '../../contracts/utils/contract-validity';
import type { PortalContractDetail, PortalContractListItem } from '../dtos/portal-contract.dto';

// `today` comes from the caller so no mapper reads a clock.
export const toPortalContractListItem = (
  row: ContractRow,
  today: string,
): PortalContractListItem => ({
  id: row.id,
  folio: row.folio,
  name: row.name,
  type: row.type,
  validFromDate: row.validFromDate,
  expiryDate: row.expiryDate,
  validity: validityOf(row, today),
  fileType: row.fileType,
  createdAt: row.createdAt.toISOString(),
});

export const toPortalContractDetail = (
  row: ContractRow,
  today: string,
): PortalContractDetail => ({
  ...toPortalContractListItem(row, today),
  description: row.description,
  fileName: row.fileName,
  fileMime: row.fileMime,
  fileSize: row.fileSize,
});

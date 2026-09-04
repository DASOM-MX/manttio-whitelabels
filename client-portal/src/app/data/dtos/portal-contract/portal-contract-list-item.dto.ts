import type { ContractFileType } from '../../../model/enums/contract/contract-file-type.enum';
import type { ContractType } from '../../../model/enums/contract/contract-type.enum';
import type { ContractValidity } from '../../../model/enums/contract/contract-validity.enum';

/** A contract row as the customer sees it (backend `PortalContractListItem`,
 *  04 §4). `validity` is derived server-side, never stored. */
export interface PortalContractListItem {
  id: string;
  folio: string;
  name: string;
  type: ContractType;
  validFromDate: string;
  expiryDate: string | null;
  validity: ContractValidity;
  /** Not always a PDF — the UI downloads rather than promising a viewer. */
  fileType: ContractFileType;
  createdAt: string;
}

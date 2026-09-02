import type {
  ContractFileType,
  ContractType,
  ContractValidity,
} from '../../contracts/enums/contracts.enum';

/** A contract as the customer sees it (04 §4). `validity` is derived, never
 *  stored. */
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

/** Adds the metadata block and the file the detail page offers. `fileKey` stays
 *  server-side; the route serves the bytes. */
export interface PortalContractDetail extends PortalContractListItem {
  description: string | null;
  fileName: string;
  fileMime: string;
  fileSize: number | null;
}

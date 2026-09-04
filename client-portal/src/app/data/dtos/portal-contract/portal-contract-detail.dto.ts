import type { PortalContractListItem } from './portal-contract-list-item.dto';

/** Adds the metadata block and the file the detail page offers (backend
 *  `PortalContractDetail`, 04 §4). `fileName`/`fileMime` are the stored
 *  document's own — never assume a `.pdf` extension or `application/pdf`. */
export interface PortalContractDetail extends PortalContractListItem {
  description: string | null;
  fileName: string;
  fileMime: string;
  fileSize: number | null;
}

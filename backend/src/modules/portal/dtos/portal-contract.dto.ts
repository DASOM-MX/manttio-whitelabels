import type {
  ContractFileType,
  ContractType,
  ContractValidity,
} from '../../contracts/enums/contracts.enum';
import type { ContractRow } from '../../contracts/types/contracts.types';
import { validityOf } from '../../contracts/utils/contract-validity';

/** A contract as the customer sees it (04 §4). `validity` is derived, never
 *  stored; `today` comes from the caller so the mapper reads no clock. */
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
  createdAt: Date;
}

/** Adds the metadata block and the file the detail page offers. `fileKey` stays
 *  server-side; the route serves the bytes. */
export interface PortalContractDetail extends PortalContractListItem {
  description: string | null;
  fileName: string;
  fileMime: string;
  fileSize: number | null;
}

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
  createdAt: row.createdAt,
});

export const toPortalContractDetail = (
  row: ContractRow,
  today: string,
): PortalContractDetail => ({
  id: row.id,
  folio: row.folio,
  name: row.name,
  type: row.type,
  validFromDate: row.validFromDate,
  expiryDate: row.expiryDate,
  validity: validityOf(row, today),
  fileType: row.fileType,
  createdAt: row.createdAt,
  description: row.description,
  fileName: row.fileName,
  fileMime: row.fileMime,
  fileSize: row.fileSize,
});

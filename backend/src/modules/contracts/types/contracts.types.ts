import type { Role } from '../../users/enums/users.enum';
import type { contracts } from '../models/contracts.model';
import type { ContractFileType, ContractType, ContractValidity } from '../enums/contracts.enum';

export type ContractRow = typeof contracts.$inferSelect;
export type NewContract = typeof contracts.$inferInsert;

/** The stored document, as resolved from an upload. Moves as one unit — the
 *  four fields are never patched independently. */
export interface ContractFile {
  fileKey: string;
  fileName: string;
  fileType: ContractFileType;
  fileMime: string;
  fileSize: number;
}

export type UpdateContractFields = Partial<
  Pick<
    ContractRow,
    | 'name'
    | 'type'
    | 'description'
    | 'validFromDate'
    | 'expiryDate'
    | 'tags'
    | 'visibleToRoles'
    | 'fileKey'
    | 'fileName'
    | 'fileType'
    | 'fileMime'
    | 'fileSize'
  >
>;

/** The contract API shape. `customerName` / `serviceOrderFolio` are derived
 *  joins, not columns — and `fileKey` is **never** exposed: the document is
 *  reachable only through GET /contracts/:id/file (13 §1.2). */
export interface ContractDTO {
  id: string;
  folio: string;
  customerId: string;
  customerName?: string;
  serviceOrderId?: string;
  serviceOrderFolio?: string;
  name: string;
  type: ContractType;
  description?: string;
  fileName: string;
  fileType: ContractFileType;
  fileMime: string;
  fileSize?: number;
  visibleToRoles: Role[];
  validFromDate: string;
  expiryDate?: string;
  /** Derived from the dates on read, never stored (13 §1). */
  validity: ContractValidity;
  tags: string[];
  createdBy: string;
  createdAt: string;
}

export interface PagedContracts {
  items: ContractDTO[];
  total: number;
  page: number;
  limit: number;
}

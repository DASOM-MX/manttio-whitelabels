import type { ContractFileType } from '../../../model/enums/contract/contract-file-type.enum';
import type { ContractType } from '../../../model/enums/contract/contract-type.enum';
import type { ContractValidity } from '../../../model/enums/contract/contract-validity.enum';
import type { Role } from '../auth';

/** One covered unit (13 §1). Name-only on list reads; the detail read fills the
 *  nameplate fields. */
export interface ContractEquipmentLink {
  id: string;
  name: string | null;
  brand?: string;
  model?: string;
  serialNumber?: string;
  kind?: string;
  capacity?: string;
  location?: string;
}

/** A filed contract document (13 §1, document-artifact model).
 *
 *  There is **no file URL** — the stored document lives in a private bucket and
 *  is reachable only through `GET /contracts/:id/file`, which re-checks access
 *  on every request (13 §1.2). Downloads fetch bytes; nothing here is a link. */
export interface Contract {
  id: string;
  folio: string;
  customerId: string;
  customerName?: string;
  /** The order that generated this contract; absent = standalone filing. */
  serviceOrderId?: string;
  serviceOrderFolio?: string;
  name: string;
  type: ContractType;
  description?: string;
  fileName: string;
  fileType: ContractFileType;
  fileMime: string;
  /** Bytes, informational. */
  fileSize?: number;
  /** Which non-manager roles may view/download this — owner/admin always can,
   *  and are the only ones who may set it. */
  visibleToRoles: Role[];
  equipment: ContractEquipmentLink[];
  validFromDate: string;
  /** Absent when the contract never expires. */
  expiryDate?: string;
  /** Derived from the dates by the backend, never stored. */
  validity: ContractValidity;
  tags: string[];
  createdBy: string;
  createdAt: string;
}

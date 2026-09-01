import type { Role } from '../../users/enums/users.enum';
import type { contracts } from '../models/contracts.model';
import type { contractEvents } from '../models/contract-events.model';
import type { ContractFileType, ContractType, ContractValidity } from '../enums/contracts.enum';
import type { ContractEventType } from '../enums/contracts.enum';

export type ContractRow = typeof contracts.$inferSelect;
export type NewContract = typeof contracts.$inferInsert;

export type ContractEventRow = typeof contractEvents.$inferSelect;
export type NewContractEvent = typeof contractEvents.$inferInsert;

/** The stored document, as resolved from an upload. Moves as one unit — the
 *  four fields are never patched independently. */
export interface ContractFile {
  fileKey: string;
  fileName: string;
  fileType: ContractFileType;
  fileMime: string;
  fileSize: number;
}

/** One covered unit, flattened for the DTO (13 §1). `name` is whatever
 *  identifies the unit on screen; the nameplate fields are populated by the
 *  SINGLE-contract read only — a list page renders names, and the detail view is
 *  already loaded before anyone needs a serial number. */
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
  /** Covered units (13 §1) — client-scoped, possibly empty. Name-only on list
   *  reads, full nameplates on the single read. */
  equipment: ContractEquipmentLink[];
  validFromDate: string;
  expiryDate?: string;
  /** Derived from the dates on read, never stored (13 §1). */
  validity: ContractValidity;
  tags: string[];
  createdBy: string;
  createdAt: string;
}

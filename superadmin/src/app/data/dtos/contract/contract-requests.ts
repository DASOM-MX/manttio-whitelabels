import type { ContractType } from '../../../model/enums/contract/contract-type.enum';
import type { ContractValidity } from '../../../model/enums/contract/contract-validity.enum';

/** The roles a contract's visibility may be set to (13 §4). Owner and admin are
 *  absent by design — they always see every contract, and are the only ones who
 *  may narrow this. */
export type ContractVisibleRole = 'office' | 'technician';

export interface ContractListQuery {
  page?: number;
  limit?: number;
  search?: string;
  customerId?: string;
  serviceOrderId?: string;
  type?: ContractType | '';
  validity?: ContractValidity | '';
  /** "Which contracts cover this unit" — exact containment, not a search. */
  equipmentId?: string;
  /** Exact-containment tag filter (`search` ilikes tags too). */
  tag?: string;
}

/** Metadata half of `POST /contracts`. The document itself rides along as the
 *  multipart `file` part — the service assembles the FormData, so callers never
 *  touch it. Create and the file are one request by design: there is no
 *  standalone upload endpoint to leave an orphan behind. */
export interface CreateContractRequest {
  customerId: string;
  serviceOrderId?: string;
  name: string;
  type: ContractType;
  description?: string;
  validFromDate: string;
  expiryDate?: string;
  tags?: string[];
  visibleToRoles?: ContractVisibleRole[];
  equipmentIds?: string[];
}

/** PATCH is **metadata only** — the stored document is replaced through
 *  `POST /contracts/:id/file` so the file fields can never drift apart.
 *  `customerId`/`serviceOrderId` are immutable: re-filing under another client
 *  would orphan the audit trail.
 *
 *  `equipmentIds` is a **full replacement set** — omit to leave the covered
 *  units untouched, send `[]` to clear them. */
export interface UpdateContractRequest {
  name?: string;
  type?: ContractType;
  description?: string | null;
  validFromDate?: string;
  expiryDate?: string | null;
  tags?: string[];
  visibleToRoles?: ContractVisibleRole[];
  equipmentIds?: string[];
}

export interface DeleteContractRequest {
  deleteComment: string;
}

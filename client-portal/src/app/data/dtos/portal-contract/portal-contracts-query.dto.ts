import type { ContractType } from '../../../model/enums/contract/contract-type.enum';
import type { ContractValidity } from '../../../model/enums/contract/contract-validity.enum';

/** `GET /portal/contracts` query (backend `portalContractsQuerySchema`,
 *  04 §4): type, validity, date range. No `customerId` — the scope is the
 *  token's. */
export interface PortalContractsQuery {
  page?: number;
  limit?: number;
  search?: string;
  type?: ContractType;
  validity?: ContractValidity;
  dateFrom?: string;
  dateTo?: string;
}

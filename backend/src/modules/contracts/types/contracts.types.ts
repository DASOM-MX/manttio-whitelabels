import type { contracts } from '../models/contracts.model';

export type ContractRow = typeof contracts.$inferSelect;
export type NewContract = typeof contracts.$inferInsert;

export type UpdateContractFields = Partial<
  Pick<
    ContractRow,
    | 'customerId'
    | 'description'
    | 'fileUrl'
    | 'fileName'
    | 'fileMime'
    | 'fileSize'
    | 'validationDate'
    | 'expiryDate'
    | 'tags'
  >
>;

/** The contract API shape returned to the superadmin. `customerName` is
 *  derived (customers join), not a column. */
export interface ContractDTO {
  id: string;
  customerId?: string;
  customerName?: string;
  description: string;
  fileUrl: string;
  fileName: string;
  fileMime: string;
  fileSize?: number;
  validationDate: string;
  expiryDate?: string;
  tags: string[];
  createdAt: string;
  deletedAt?: string;
}

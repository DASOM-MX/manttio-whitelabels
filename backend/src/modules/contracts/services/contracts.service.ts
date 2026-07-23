import type { Db } from '../../database/client';
import {
  findContractWithMeta,
  insertContract,
  listContracts,
  softDeleteContract,
  updateContract,
  type ContractMetaRow,
} from '../repository/contracts.repository';
import type {
  CreateContractInput,
  ListContractsQuery,
  UpdateContractInput,
} from '../validators/contracts.validator';
import type {
  ContractDTO,
  ContractRow,
  NewContract,
  UpdateContractFields,
} from '../types/contracts.types';

const opt = <T>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

const toDTO = (row: ContractRow, customerName?: string | null): ContractDTO => ({
  id: row.id,
  customerId: opt(row.customerId),
  customerName: opt(customerName),
  description: row.description,
  fileUrl: row.fileUrl,
  fileName: row.fileName,
  fileMime: row.fileMime,
  fileSize: opt(row.fileSize),
  validationDate: row.validationDate,
  expiryDate: opt(row.expiryDate),
  tags: row.tags ?? [],
  createdAt: row.createdAt.toISOString(),
  deletedAt: row.deletedAt ? row.deletedAt.toISOString() : undefined,
});

const metaToDTO = (m: ContractMetaRow): ContractDTO => toDTO(m.row, m.customerName);

// Tags are the search index (13 §1): stored trimmed, lowercased, deduped so
// exact-containment filters match predictably.
const normalizeTags = (tags: string[] | undefined): string[] => {
  if (!tags) return [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const tag = raw.trim().toLowerCase();
    if (tag) seen.add(tag);
  }
  return [...seen];
};

const collectUpdate = (input: UpdateContractInput): UpdateContractFields => {
  const f: UpdateContractFields = {};
  if (input.customerId !== undefined) f.customerId = input.customerId ?? null;
  if (input.description !== undefined) f.description = input.description;
  if (input.fileUrl !== undefined) f.fileUrl = input.fileUrl;
  if (input.fileName !== undefined) f.fileName = input.fileName;
  if (input.fileMime !== undefined) f.fileMime = input.fileMime;
  if (input.fileSize !== undefined) f.fileSize = input.fileSize ?? null;
  if (input.validationDate !== undefined) f.validationDate = input.validationDate;
  if (input.expiryDate !== undefined) f.expiryDate = input.expiryDate ?? null;
  if (input.tags !== undefined) f.tags = normalizeTags(input.tags);
  return f;
};

export const getContracts = async (
  db: Db,
  q: ListContractsQuery,
): Promise<{ items: ContractDTO[]; total: number; page: number; limit: number }> => {
  const { items, total } = await listContracts(
    db,
    { search: q.search, customerId: q.customerId, tag: q.tag },
    q.page,
    q.limit,
  );
  return { items: items.map(metaToDTO), total, page: q.page, limit: q.limit };
};

export const getContractById = async (db: Db, id: string): Promise<ContractDTO | null> => {
  const meta = await findContractWithMeta(db, id);
  return meta ? metaToDTO(meta) : null;
};

export const createContract = async (
  db: Db,
  input: CreateContractInput,
): Promise<ContractDTO> => {
  const values: NewContract = {
    customerId: input.customerId ?? null,
    description: input.description,
    fileUrl: input.fileUrl,
    fileName: input.fileName,
    fileMime: input.fileMime,
    fileSize: input.fileSize ?? null,
    validationDate: input.validationDate,
    expiryDate: input.expiryDate ?? null,
    tags: normalizeTags(input.tags),
  };
  const row = await insertContract(db, values);
  return (await getContractById(db, row.id)) ?? toDTO(row);
};

export const editContract = async (
  db: Db,
  id: string,
  input: UpdateContractInput,
): Promise<ContractDTO | null> => {
  const row = await updateContract(db, id, collectUpdate(input));
  if (!row) return null;
  return getContractById(db, id);
};

export const removeContract = async (
  db: Db,
  id: string,
  deleteComment: string,
  actorId: string,
): Promise<{ id: string } | null> => softDeleteContract(db, id, deleteComment, actorId);

import type { Db } from '../../database/client';
import type { AuthUser } from '../../../env';
import type { Role } from '../../users/enums/users.enum';
import {
  equipmentForContract,
  equipmentForContracts,
  findContractFile,
  findContractWithMeta,
  insertContract,
  listContracts,
  softDeleteContract,
  updateContract,
  type ContractMetaRow,
} from '../repository/contracts.repository';
import { equipmentIdsForCustomer } from '../../equipment/repository/equipment.repository';
import type {
  CreateContractMetaInput,
  ListContractsQuery,
  UpdateContractInput,
} from '../validators/contracts.validator';
import type {
  ContractDTO,
  ContractEquipmentLink,
  ContractFile,
  ContractRow,
  UpdateContractFields,
} from '../types/contracts.types';
import type { GenericQueryResponse } from '../../shared/types/generic-query-response.types';
import { ContractValidity } from '../enums/contracts.enum';
import { ContractVisibilityForbiddenError } from '../http-errors/contract-visibility-forbidden.error';
import { ContractEquipmentMismatchError } from '../http-errors/contract-equipment-mismatch.error';

const opt = <T>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

const DEFAULT_VISIBLE_TO_ROLES: Role[] = ['office', 'technician'];

/** Derived from the dates, never stored (13 §1) — mirrors `validityFilter` in
 *  the repository, which is the SQL half of the same rule. */
const validityOf = (row: ContractRow, today: string): ContractValidity => {
  if (row.validFromDate > today) return ContractValidity.NotStarted;
  if (row.expiryDate && row.expiryDate < today) return ContractValidity.Expired;
  return ContractValidity.Active;
};

const toDTO = (
  m: ContractMetaRow,
  today: string,
  equipment: ContractEquipmentLink[],
): ContractDTO => ({
  id: m.row.id,
  folio: m.row.folio,
  customerId: m.row.customerId,
  customerName: opt(m.customerName),
  serviceOrderId: opt(m.row.serviceOrderId),
  serviceOrderFolio: opt(m.serviceOrderFolio),
  name: m.row.name,
  type: m.row.type,
  description: opt(m.row.description),
  fileName: m.row.fileName,
  fileType: m.row.fileType,
  fileMime: m.row.fileMime,
  fileSize: opt(m.row.fileSize),
  visibleToRoles: m.row.visibleToRoles ?? [],
  equipment,
  validFromDate: m.row.validFromDate,
  expiryDate: opt(m.row.expiryDate),
  validity: validityOf(m.row, today),
  tags: m.row.tags ?? [],
  createdBy: m.row.createdBy,
  createdAt: m.row.createdAt.toISOString(),
});

const todayString = () => new Date().toISOString().slice(0, 10);

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

/** Only owner/admin may set per-contract visibility (13 §4). Office may edit
 *  everything else about a contract it can see, so this is a field-level check
 *  rather than a route-level `requireRole`. */
const assertMaySetVisibility = (user: AuthUser): void => {
  if (user.role !== 'owner' && user.role !== 'admin') {
    throw new ContractVisibilityForbiddenError();
  }
};

/** Covered units are **client-scoped** (13 §1): a contract may only cover
 *  equipment belonging to its own customer. A foreign unit is a data error worth
 *  naming rather than silently dropping — the same rule visits enforce (12 §1).
 *  Soft-deleted units count as foreign: they are no longer part of the fleet. */
const assertEquipmentBelongsToCustomer = async (
  db: Db,
  customerId: string,
  ids: string[],
): Promise<void> => {
  if (!ids.length) return;
  const owned = new Set(await equipmentIdsForCustomer(db, customerId, ids));
  const foreign = ids.filter((id) => !owned.has(id));
  if (foreign.length) throw new ContractEquipmentMismatchError(foreign);
};

/** Attach the covered units to a page of contracts in one extra query rather
 *  than one per row. */
const toPageDTOs = async (
  db: Db,
  items: ContractMetaRow[],
): Promise<ContractDTO[]> => {
  const links = await equipmentForContracts(
    db,
    items.map((m) => m.row.id),
  );
  const today = todayString();
  return items.map((m) => toDTO(m, today, links.get(m.row.id) ?? []));
};

export const getContracts = async (
  db: Db,
  q: ListContractsQuery,
  user: AuthUser,
): Promise<GenericQueryResponse<ContractDTO>> => {
  const page = await listContracts(db, q, user.role);
  return { ...page, items: await toPageDTOs(db, page.items) };
};

/** Unpaged card feeds for the customer 360 (07) and the order view (19 §5).
 *  Role-scoped like every other read, and capped rather than paged — a client
 *  or a job with more than this many contracts belongs on the filtered list
 *  page, not in a card. */
const CARD_FEED_LIMIT = 50;

const cardFeed = async (
  db: Db,
  filter: { customerId?: string; serviceOrderId?: string },
  user: AuthUser,
): Promise<ContractDTO[]> => {
  const { items } = await listContracts(
    db,
    { page: 1, limit: CARD_FEED_LIMIT, ...filter },
    user.role,
  );
  return toPageDTOs(db, items);
};

export const getCustomerContracts = (db: Db, customerId: string, user: AuthUser) =>
  cardFeed(db, { customerId }, user);

export const getServiceOrderContracts = (db: Db, serviceOrderId: string, user: AuthUser) =>
  cardFeed(db, { serviceOrderId }, user);

export const getContractById = async (
  db: Db,
  id: string,
  user: AuthUser,
): Promise<ContractDTO | null> => {
  const meta = await findContractWithMeta(db, id, user.role);
  if (!meta) return null;
  // The detail read is the one place nameplates are worth fetching (13 §6).
  return toDTO(meta, todayString(), await equipmentForContract(db, id));
};

export const createContract = async (
  db: Db,
  input: CreateContractMetaInput,
  file: ContractFile,
  user: AuthUser,
): Promise<ContractDTO> => {
  if (input.visibleToRoles) assertMaySetVisibility(user);

  const equipmentIds = [...new Set(input.equipmentIds ?? [])];
  await assertEquipmentBelongsToCustomer(db, input.customerId, equipmentIds);

  const row = await insertContract(
    db,
    {
      customerId: input.customerId,
      serviceOrderId: input.serviceOrderId ?? null,
      name: input.name,
      type: input.type,
      description: input.description ?? null,
      fileKey: file.fileKey,
      fileName: file.fileName,
      fileType: file.fileType,
      fileMime: file.fileMime,
      fileSize: file.fileSize,
      visibleToRoles: input.visibleToRoles ?? DEFAULT_VISIBLE_TO_ROLES,
      validFromDate: input.validFromDate,
      expiryDate: input.expiryDate ?? null,
      tags: normalizeTags(input.tags),
      createdBy: user.id,
      equipmentIds,
    },
    new Date(),
  );

  return (
    (await getContractById(db, row.id, user)) ??
    toDTO({ row, customerName: null, serviceOrderFolio: null }, todayString(), [])
  );
};

// Spanish field labels for the audit body — the timeline says *what* changed,
// not just that something did (13 §3).
const FIELD_LABELS: Record<keyof UpdateContractInput, string> = {
  name: 'nombre',
  type: 'tipo',
  description: 'descripción',
  validFromDate: 'vigencia desde',
  expiryDate: 'vencimiento',
  tags: 'etiquetas',
  visibleToRoles: 'visibilidad',
  equipmentIds: 'equipos cubiertos',
};

const collectUpdate = (input: UpdateContractInput): UpdateContractFields => {
  const f: UpdateContractFields = {};
  if (input.name !== undefined) f.name = input.name;
  if (input.type !== undefined) f.type = input.type;
  if (input.description !== undefined) f.description = input.description;
  if (input.validFromDate !== undefined) f.validFromDate = input.validFromDate;
  if (input.expiryDate !== undefined) f.expiryDate = input.expiryDate;
  if (input.tags !== undefined) f.tags = normalizeTags(input.tags);
  if (input.visibleToRoles !== undefined) f.visibleToRoles = input.visibleToRoles;
  return f;
};

export const editContract = async (
  db: Db,
  id: string,
  input: UpdateContractInput,
  user: AuthUser,
): Promise<ContractDTO | null> => {
  if (input.visibleToRoles !== undefined) assertMaySetVisibility(user);

  // Scoped read first: an office user must not be able to patch a contract
  // they cannot see.
  const existing = await findContractWithMeta(db, id, user.role);
  if (!existing) return null;

  // The covered-unit set lives in the join table, not on the row, so it travels
  // beside `fields` rather than inside it — but it is still one transaction and
  // one audit entry.
  const replaceEquipmentIds =
    input.equipmentIds === undefined ? undefined : [...new Set(input.equipmentIds)];
  if (replaceEquipmentIds) {
    await assertEquipmentBelongsToCustomer(db, existing.row.customerId, replaceEquipmentIds);
  }

  const fields = collectUpdate(input);
  const labels = (Object.keys(fields) as (keyof UpdateContractInput)[]).map((k) => FIELD_LABELS[k]);
  if (replaceEquipmentIds) labels.push(FIELD_LABELS.equipmentIds);
  const changed = labels.join(', ');

  const row = await updateContract(
    db,
    id,
    fields,
    {
      body: `Contrato ${existing.row.folio} actualizado — ${changed || 'sin cambios'}`,
      actorId: user.id,
    },
    replaceEquipmentIds,
  );
  if (!row) return null;
  return getContractById(db, id, user);
};

/** Replace the stored document (13 §1.2). A new upload swaps the whole file
 *  unit at once; old versions are not kept (decided 2026-07-24). */
export const replaceContractFile = async (
  db: Db,
  id: string,
  file: ContractFile,
  user: AuthUser,
): Promise<ContractDTO | null> => {
  const existing = await findContractWithMeta(db, id, user.role);
  if (!existing) return null;

  const row = await updateContract(
    db,
    id,
    {
      fileKey: file.fileKey,
      fileName: file.fileName,
      fileType: file.fileType,
      fileMime: file.fileMime,
      fileSize: file.fileSize,
    },
    {
      body: `Contrato ${existing.row.folio} — documento reemplazado (${file.fileName})`,
      actorId: user.id,
    },
  );
  if (!row) return null;
  return getContractById(db, id, user);
};

export const removeContract = async (
  db: Db,
  id: string,
  deleteComment: string,
  user: AuthUser,
): Promise<{ id: string } | null> => {
  const existing = await findContractWithMeta(db, id, user.role);
  if (!existing) return null;
  return softDeleteContract(db, id, deleteComment, user.id);
};

/** Resolve the private R2 key for the download route. */
export const getContractFile = (db: Db, id: string, user: AuthUser) =>
  findContractFile(db, id, user.role);

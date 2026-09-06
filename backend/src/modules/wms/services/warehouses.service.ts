import type { AuthUser } from '../../../env';
import { isBackOfficeTier } from '../../auth/utils/role-tier';
import type { Db } from '../../database/client';
import { findUserById } from '../../users/repository/users.repository';
import { AssignmentRole } from '../enums/assignments.enum';
import { WarehouseType } from '../enums/warehouses.enum';
import {
  AssigneeNotFoundError,
  IncompleteAssignmentError,
  InvalidParentError,
  NodeWarehouseMismatchError,
  NotATechnicianError,
  NotOwnWarehouseError,
  TechnicianAlreadyAssignedError,
  WarehouseNotEmptyError,
  WarehouseNotFoundError,
  WarehouseNotLocatableError,
} from '../http-errors/warehouses.error';
import { findStorageNodeById } from '../repository/storage-nodes.repository';
import {
  findLiveTechnicianVan,
  findWarehouseById,
  hasLiveChildWarehouses,
  insertWarehouse,
  listWarehouses,
  setWarehouseAssignment,
  softDeleteWarehouseWithNodes,
  summarizeWarehouseStock,
  updateWarehouseRow,
  warehouseHasStock,
} from '../repository/warehouses.repository';
import {
  listStockEntriesAt,
  listStockLotsAt,
  listStockUnitsAt,
} from '../repository/warehouse-stock.repository';
import type {
  DeletedRef,
  LocationAssigneeDTO,
  StockLocationRefDTO,
  UpdateWarehouseFields,
  WarehouseDTO,
  WarehouseReadRow,
  WarehouseRow,
  WarehouseStockDTO,
  WarehouseTreeDTO,
} from '../types/warehouses.types';
import type {
  AssignWarehouseInput,
  CreateWarehouseInput,
  ListWarehousesQuery,
  UpdateWarehouseInput,
} from '../validators/warehouses.validator';

const opt = <T>(value: T | null): T | undefined => value ?? undefined;

/** `type` is derived, never stored (01 §2): no parent means root. */
const warehouseType = (row: WarehouseRow): WarehouseType =>
  row.parentId ? WarehouseType.SubWarehouse : WarehouseType.Warehouse;

/** The assignee is only ever half-present in theory — the DB check pairs the
 *  user and the role — so a missing name means the join found no live user,
 *  and the DTO drops the block rather than rendering a nameless badge. */
const assignee = (row: WarehouseRow, name: string | null): LocationAssigneeDTO | undefined =>
  row.assignedUserId && row.assignmentRole && name
    ? { id: row.assignedUserId, name, role: row.assignmentRole }
    : undefined;

const toWarehouseDTO = ({ warehouse, assigneeName }: WarehouseReadRow): WarehouseDTO => ({
  id: warehouse.id,
  name: warehouse.name,
  type: warehouseType(warehouse),
  parentId: opt(warehouse.parentId),
  address: opt(warehouse.address),
  locationReference: opt(warehouse.locationReference),
  latitude: opt(warehouse.latitude),
  longitude: opt(warehouse.longitude),
  notes: opt(warehouse.notes),
  assignedUser: assignee(warehouse, assigneeName),
  createdAt: warehouse.createdAt.toISOString(),
});

/** Stock may sit at warehouse level (the node column is nullable on all three
 *  stock tables), and a left join answers that with a null OBJECT rather than
 *  null fields — so the whole block is what has to be checked. */
const toLocationRef = (node: StockLocationRefDTO | null): StockLocationRefDTO | undefined =>
  node ?? undefined;

/** A warehouse must stay findable (`warehouses_locatable_check`). Judged on the
 *  MERGED row so a PATCH that clears the last locator is refused with a named
 *  code instead of a constraint violation surfacing as a 500. */
const assertLocatable = (row: {
  locationReference: string | null;
  latitude: number | null;
  longitude: number | null;
}) => {
  const located = row.locationReference !== null || (row.latitude !== null && row.longitude !== null);
  if (!located) throw new WarehouseNotLocatableError();
};

/** Reads are open to every authenticated role, but a technician sees only their
 *  own van (02 §2). Staff — owner, admin, office — see the whole registry:
 *  office is operational and needs to know where stock lives. */
const assertReadable = (user: AuthUser, row: WarehouseRow) => {
  if (isBackOfficeTier(user)) return;
  const ownVan =
    row.assignedUserId === user.id && row.assignmentRole === AssignmentRole.Technician;
  if (!ownVan) throw new NotOwnWarehouseError(row.id);
};

export const getWarehouses = async (
  db: Db,
  user: AuthUser,
  query: ListWarehousesQuery,
): Promise<WarehouseDTO[]> => {
  const rows = await listWarehouses(db, {
    parentId: query.parentId,
    // Staff see everything; a technician's list hides colleagues' vans, which
    // is also what makes it a safe self-checkout source list (06 §5).
    visibleToTechnicianId: isBackOfficeTier(user) ? undefined : user.id,
  });
  return rows.map(toWarehouseDTO);
};

/** The registry list (02 §2): roots with their live sub-warehouses nested, each
 *  carrying its own stock summary. Exactly two levels — v1 nests once. */
export const getWarehouseTree = async (db: Db): Promise<WarehouseTreeDTO[]> => {
  const [rows, summary] = await Promise.all([
    listWarehouses(db, {}),
    summarizeWarehouseStock(db),
  ]);

  const empty = { materialCount: 0, unitCount: 0 };
  const toTreeDTO = (row: WarehouseReadRow): WarehouseTreeDTO => ({
    ...toWarehouseDTO(row),
    stockSummary: summary.get(row.warehouse.id) ?? empty,
    children: [],
  });

  const byId = new Map(rows.map((row) => [row.warehouse.id, toTreeDTO(row)]));
  const roots: WarehouseTreeDTO[] = [];
  for (const row of rows) {
    const dto = byId.get(row.warehouse.id);
    if (!dto) continue;
    const parent = row.warehouse.parentId ? byId.get(row.warehouse.parentId) : undefined;
    // A sub-warehouse whose parent is soft-deleted would otherwise vanish from
    // the registry entirely. Surfacing it as a root is the honest answer —
    // it still exists and may still hold stock.
    if (parent) parent.children.push(dto);
    else roots.push(dto);
  }
  return roots;
};

export const getWarehouse = async (
  db: Db,
  user: AuthUser,
  id: string,
): Promise<WarehouseDTO | null> => {
  const row = await findWarehouseById(db, id);
  if (!row) return null;
  assertReadable(user, row.warehouse);
  return toWarehouseDTO(row);
};

/** v1 nests exactly one level (01 §2): a parent must be a live ROOT. */
const resolveParent = async (db: Db, parentId: string, selfId?: string) => {
  if (selfId && parentId === selfId) {
    throw new InvalidParentError('a warehouse cannot be its own parent');
  }
  const parent = await findWarehouseById(db, parentId);
  if (!parent) throw new InvalidParentError('the parent warehouse does not exist');
  if (parent.warehouse.parentId) {
    throw new InvalidParentError('a sub-warehouse cannot hold sub-warehouses');
  }
};

export const createWarehouse = async (
  db: Db,
  input: CreateWarehouseInput,
): Promise<WarehouseDTO> => {
  if (input.parentId) await resolveParent(db, input.parentId);
  const row = await insertWarehouse(db, {
    name: input.name,
    parentId: input.parentId ?? null,
    address: input.address ?? null,
    locationReference: input.locationReference ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    notes: input.notes ?? null,
  });
  // Freshly created, so it has no assignee yet — the join would return null
  // anyway and this saves the read-back.
  return toWarehouseDTO({ warehouse: row, assigneeName: null });
};

export const editWarehouse = async (
  db: Db,
  id: string,
  input: UpdateWarehouseInput,
): Promise<WarehouseDTO | null> => {
  const current = await findWarehouseById(db, id);
  if (!current) return null;

  const fields: UpdateWarehouseFields = {};
  if (input.name !== undefined) fields.name = input.name;
  if (input.address !== undefined) fields.address = input.address;
  if (input.locationReference !== undefined) fields.locationReference = input.locationReference;
  if (input.latitude !== undefined) fields.latitude = input.latitude;
  if (input.longitude !== undefined) fields.longitude = input.longitude;
  if (input.notes !== undefined) fields.notes = input.notes;

  // Re-parenting is empty-only (02 §2): moving a loaded warehouse would move
  // stock without a movement, and the journal is the only record of where
  // things are.
  if (input.parentId !== undefined && input.parentId !== current.warehouse.parentId) {
    if (input.parentId !== null) await resolveParent(db, input.parentId, id);
    if (await warehouseHasStock(db, id)) {
      throw new WarehouseNotEmptyError('a warehouse holding stock cannot be moved');
    }
    if (await hasLiveChildWarehouses(db, id)) {
      throw new WarehouseNotEmptyError('a warehouse with sub-warehouses cannot be moved');
    }
    fields.parentId = input.parentId;
  }

  // Merged with `undefined` checks, never `??`: `null` here means "clear this",
  // and `??` would read that as "not supplied" and quietly keep the old value —
  // letting a PATCH erase the last locator the check exists to protect.
  const merged = <T>(patched: T | undefined, stored: T): T =>
    patched !== undefined ? patched : stored;
  assertLocatable({
    locationReference: merged(input.locationReference, current.warehouse.locationReference),
    latitude: merged(input.latitude, current.warehouse.latitude),
    longitude: merged(input.longitude, current.warehouse.longitude),
  });

  // A PATCH that changes nothing is a no-op, not an error: drizzle refuses an
  // empty `.set({})`, and an editor that submits the whole form unchanged — or
  // re-states the one immutable field — would otherwise get a 500.
  if (Object.keys(fields).length === 0) return toWarehouseDTO(current);

  const row = await updateWarehouseRow(db, id, fields);
  if (!row) return null;
  return toWarehouseDTO({ warehouse: row, assigneeName: current.assigneeName });
};

/** `POST /warehouses/:id/assign-technician` (02 §2). The assignee may be any
 *  live user — an admin supervising a warehouse is ordinary — but the
 *  `technician` assignment role is the van marker, so it alone carries the
 *  role check and the one-van exclusivity. */
export const assignWarehouse = async (
  db: Db,
  id: string,
  input: AssignWarehouseInput,
): Promise<WarehouseDTO | null> => {
  const current = await findWarehouseById(db, id);
  if (!current) return null;

  if (input.userId === null) {
    const row = await setWarehouseAssignment(db, id, null);
    if (!row) return null;
    return toWarehouseDTO({ warehouse: row, assigneeName: null });
  }

  // The validator already refuses a user without a role; this narrows the type
  // rather than defaulting one — guessing `technician` here would silently make
  // a van out of a body that never asked for one.
  if (input.role === undefined) throw new IncompleteAssignmentError('user');
  const role = input.role;
  const user = await findUserById(db, input.userId);
  if (!user) throw new AssigneeNotFoundError(input.userId);

  if (role === AssignmentRole.Technician) {
    if (user.role !== 'technician') throw new NotATechnicianError(input.userId);
    const existing = await findLiveTechnicianVan(db, input.userId, id);
    if (existing) throw new TechnicianAlreadyAssignedError(input.userId, existing.id);
  }

  const row = await setWarehouseAssignment(db, id, {
    assignedUserId: input.userId,
    assignmentRole: role,
  });
  if (!row) return null;
  return toWarehouseDTO({ warehouse: row, assigneeName: user.name });
};

/** Delete is soft and empty-only, and takes the warehouse's storage nodes with
 *  it (01 §2). No audit comment: movements are the audit here (03 §3). */
export const removeWarehouse = async (db: Db, id: string): Promise<DeletedRef | null> => {
  const current = await findWarehouseById(db, id);
  if (!current) return null;

  if (await hasLiveChildWarehouses(db, id)) {
    throw new WarehouseNotEmptyError('delete or move its sub-warehouses first');
  }
  if (await warehouseHasStock(db, id)) {
    throw new WarehouseNotEmptyError('empty its stock before deleting it');
  }

  const row = await softDeleteWarehouseWithNodes(db, id);
  return row ? { id: row.id } : null;
};

/** `GET /warehouses/:id/stock` (02 §2). Three lists, one per tracking mode —
 *  they carry different columns and the panel renders them apart (04 §2). */
export const getWarehouseStock = async (
  db: Db,
  user: AuthUser,
  id: string,
  nodeId?: string,
): Promise<WarehouseStockDTO | null> => {
  const warehouse = await findWarehouseById(db, id);
  if (!warehouse) return null;
  assertReadable(user, warehouse.warehouse);

  if (nodeId) {
    const node = await findStorageNodeById(db, nodeId);
    if (!node) throw new NodeWarehouseMismatchError(nodeId, id);
    if (node.node.warehouseId !== id) throw new NodeWarehouseMismatchError(nodeId, id);
  }

  const [entries, units, lots] = await Promise.all([
    listStockEntriesAt(db, id, nodeId),
    listStockUnitsAt(db, id, nodeId),
    listStockLotsAt(db, id, nodeId),
  ]);

  return {
    entries: entries.map((row) => ({
      material: { ...row.material, sku: opt(row.material.sku) },
      node: toLocationRef(row.node),
      quantity: row.quantity,
    })),
    units: units.map((row) => ({
      id: row.id,
      serialNumber: row.serialNumber,
      status: row.status,
      material: { ...row.material, sku: opt(row.material.sku) },
      node: toLocationRef(row.node),
    })),
    lots: lots.map((row) => ({
      material: { ...row.material, sku: opt(row.material.sku) },
      node: toLocationRef(row.node),
      lotNumber: row.lotNumber,
      quantity: row.quantity,
      pieces: row.pieces,
      expiresAt: row.expiresAt?.toISOString(),
    })),
  };
};

/** Shared by the node endpoints: the warehouse in the path must exist, and a
 *  technician may only reach their own. Throws rather than returning null so
 *  every caller answers 404/403 the same way. */
export const assertWarehouseAccess = async (
  db: Db,
  user: AuthUser,
  id: string,
): Promise<WarehouseRow> => {
  const row = await findWarehouseById(db, id);
  if (!row) throw new WarehouseNotFoundError(id);
  assertReadable(user, row.warehouse);
  return row.warehouse;
};

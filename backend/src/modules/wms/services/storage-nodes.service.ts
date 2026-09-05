import type { AuthUser } from '../../../env';
import type { Db } from '../../database/client';
import { isUniqueViolation } from '../../database/db-errors';
import { findUserById } from '../../users/repository/users.repository';
import { ASSIGNABLE_NODE_TYPES } from '../constants/assignable-node-types';
import { STORAGE_NODE_RANK } from '../constants/storage-node-rank';
import { AssignmentRole } from '../enums/assignments.enum';
import { StorageNodeType } from '../enums/storage-nodes.enum';
import {
  AssigneeNotFoundError,
  DuplicateNodeNameError,
  IncompleteAssignmentError,
  InvalidAssignmentLevelError,
  InvalidParentTypeError,
  NodeNotEmptyError,
  NodeWarehouseMismatchError,
  NotATechnicianError,
  StorageNodeNotFoundError,
} from '../http-errors/warehouses.error';
import {
  findStorageNodeById,
  hasLiveChildNodes,
  insertStorageNode,
  listStorageNodes,
  nodeHasStock,
  softDeleteStorageNode,
  updateStorageNodeRow,
} from '../repository/storage-nodes.repository';
import { toStorageNodeDTO } from '../utils/storage-node-dto';
import { assertWarehouseAccess } from './warehouses.service';
import type {
  DeletedRef,
  LocationAssignment,
  StorageNodeDTO,
  UpdateStorageNodeFields,
} from '../types/warehouses.types';
import type {
  CreateStorageNodeInput,
  ListStorageNodesQuery,
  UpdateStorageNodeInput,
} from '../validators/warehouses.validator';

/** The rank rule (01 §2): a child's rank must be STRICTLY greater than its
 *  parent's. Levels are skippable — a box directly inside a storage unit is
 *  legal — but nothing may nest in its own type or climb back up, which is
 *  also what makes `warehouse` (rank 0) root-only. */
const assertRankAllows = (parentType: StorageNodeType, childType: StorageNodeType) => {
  if (STORAGE_NODE_RANK[parentType] >= STORAGE_NODE_RANK[childType]) {
    throw new InvalidParentTypeError(parentType, childType);
  }
};

/** Resolves the assignment a write leaves behind, validating the pair, the
 *  level and the user in one place — create and PATCH answer the same rules,
 *  and PATCH additionally has to judge them against what's already stored. */
const resolveAssignment = async (
  db: Db,
  type: StorageNodeType,
  next: { userId: string | null; role: AssignmentRole | null },
): Promise<LocationAssignment> => {
  if (next.userId === null && next.role === null) {
    return { assignedUserId: null, assignmentRole: null };
  }
  if (next.userId === null) throw new IncompleteAssignmentError('role');
  if (next.role === null) throw new IncompleteAssignmentError('user');

  if (!ASSIGNABLE_NODE_TYPES.includes(type)) throw new InvalidAssignmentLevelError(type);

  const user = await findUserById(db, next.userId);
  if (!user) throw new AssigneeNotFoundError(next.userId);
  // Same rule as a warehouse van: the technician assignment role means a
  // technician. Supervisor and leader are open to any live user.
  if (next.role === AssignmentRole.Technician && user.role !== 'technician') {
    throw new NotATechnicianError(next.userId);
  }

  return { assignedUserId: next.userId, assignmentRole: next.role };
};

export const getStorageNodes = async (
  db: Db,
  user: AuthUser,
  warehouseId: string,
  query: ListStorageNodesQuery,
): Promise<StorageNodeDTO[]> => {
  await assertWarehouseAccess(db, user, warehouseId);

  if (query.parentNodeId) {
    const parent = await findStorageNodeById(db, query.parentNodeId);
    if (!parent || parent.node.warehouseId !== warehouseId) {
      throw new NodeWarehouseMismatchError(query.parentNodeId, warehouseId);
    }
  }

  const rows = await listStorageNodes(db, warehouseId, query.parentNodeId);
  return rows.map((row) => toStorageNodeDTO(row.node, row.assigneeName, row.hasChildren));
};

export const createStorageNode = async (
  db: Db,
  user: AuthUser,
  warehouseId: string,
  input: CreateStorageNodeInput,
): Promise<StorageNodeDTO> => {
  await assertWarehouseAccess(db, user, warehouseId);

  if (input.parentNodeId) {
    const parent = await findStorageNodeById(db, input.parentNodeId);
    if (!parent || parent.node.warehouseId !== warehouseId) {
      throw new NodeWarehouseMismatchError(input.parentNodeId, warehouseId);
    }
    assertRankAllows(parent.node.type, input.type);
  }

  const assignment = await resolveAssignment(db, input.type, {
    userId: input.assignedUserId ?? null,
    role: input.assignmentRole ?? null,
  });

  try {
    const row = await insertStorageNode(db, {
      warehouseId,
      parentNodeId: input.parentNodeId ?? null,
      type: input.type,
      name: input.name,
      description: input.description ?? null,
      locationReference: input.locationReference ?? null,
      ...assignment,
    });
    // Just created, so it has no children yet, and the assignee's name is only
    // needed when there is one — skip the read-back either way.
    const assigneeName = assignment.assignedUserId
      ? ((await findUserById(db, assignment.assignedUserId))?.name ?? null)
      : null;
    return toStorageNodeDTO(row, assigneeName, false);
  } catch (err) {
    // Raised from the unique index rather than a pre-check, so two concurrent
    // creates can't both pass a lookup and then both insert.
    if (isUniqueViolation(err)) throw new DuplicateNodeNameError(input.name);
    throw err;
  }
};

export const editStorageNode = async (
  db: Db,
  user: AuthUser,
  warehouseId: string,
  nodeId: string,
  input: UpdateStorageNodeInput,
): Promise<StorageNodeDTO | null> => {
  await assertWarehouseAccess(db, user, warehouseId);

  const current = await findStorageNodeById(db, nodeId);
  if (!current) return null;
  if (current.node.warehouseId !== warehouseId) {
    throw new NodeWarehouseMismatchError(nodeId, warehouseId);
  }

  const fields: UpdateStorageNodeFields = {};
  if (input.name !== undefined) fields.name = input.name;
  if (input.description !== undefined) fields.description = input.description;
  if (input.locationReference !== undefined) fields.locationReference = input.locationReference;

  // A PATCH may send one side of the assignment — `{ assignmentRole: 'leader' }`
  // on an already-assigned node is a role change, not a half-assignment — so
  // the pair is judged on the merged result, never on the body alone.
  if (input.assignedUserId !== undefined || input.assignmentRole !== undefined) {
    const assignment = await resolveAssignment(db, current.node.type, {
      userId:
        input.assignedUserId !== undefined ? input.assignedUserId : current.node.assignedUserId,
      role:
        input.assignmentRole !== undefined ? input.assignmentRole : current.node.assignmentRole,
    });
    fields.assignedUserId = assignment.assignedUserId;
    fields.assignmentRole = assignment.assignmentRole;
  }

  try {
    const row = await updateStorageNodeRow(db, nodeId, fields);
    if (!row) return null;
    const assigneeName = row.assignedUserId
      ? ((await findUserById(db, row.assignedUserId))?.name ?? null)
      : null;
    return toStorageNodeDTO(row, assigneeName, current.hasChildren);
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateNodeNameError(input.name ?? current.node.name);
    throw err;
  }
};

/** Soft delete, empty-only (01 §2): movements reference nodes forever, so the
 *  row outlives the structure and nothing about it is ever removed. */
export const removeStorageNode = async (
  db: Db,
  user: AuthUser,
  warehouseId: string,
  nodeId: string,
): Promise<DeletedRef | null> => {
  await assertWarehouseAccess(db, user, warehouseId);

  const current = await findStorageNodeById(db, nodeId);
  if (!current) return null;
  if (current.node.warehouseId !== warehouseId) {
    throw new NodeWarehouseMismatchError(nodeId, warehouseId);
  }

  if (await hasLiveChildNodes(db, nodeId)) {
    throw new NodeNotEmptyError('delete the locations inside it first');
  }
  if (await nodeHasStock(db, nodeId)) {
    throw new NodeNotEmptyError('move its stock elsewhere before deleting it');
  }

  const row = await softDeleteStorageNode(db, nodeId);
  if (!row) throw new StorageNodeNotFoundError(nodeId);
  return { id: row.id };
};

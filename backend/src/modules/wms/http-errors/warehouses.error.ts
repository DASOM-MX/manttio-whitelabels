import type { StorageNodeType } from '../enums/storage-nodes.enum';

/** The warehouse named in the path is gone (soft-deleted) or never existed.
 *  Thrown by the write paths so a missing parent resource is a clean 404
 *  instead of an FK violation surfacing as a 500. Controller maps it to
 *  `404 not_found`. */
export class WarehouseNotFoundError extends Error {
  constructor(public warehouseId: string) {
    super(`warehouse not found: ${warehouseId}`);
    this.name = 'WarehouseNotFoundError';
  }
}

/** Same for a storage node addressed by `:nodeId`. Controller maps it to
 *  `404 not_found`. */
export class StorageNodeNotFoundError extends Error {
  constructor(public nodeId: string) {
    super(`storage node not found: ${nodeId}`);
    this.name = 'StorageNodeNotFoundError';
  }
}

/** The proposed `parentId` can't hold this warehouse: it doesn't exist, it is
 *  the warehouse itself, or it is already a sub-warehouse (v1 allows exactly
 *  one level of nesting — 01 §2). `reason` is carried so the message can say
 *  which of the three it was. Controller maps it to `400 invalid_parent`. */
export class InvalidParentError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = 'InvalidParentError';
  }
}

/** The rank rule (01 §2, `constants/storage-node-rank.ts`): a child's rank must
 *  be STRICTLY greater than its parent's, so levels are skippable but a node can
 *  never sit under its own type or climb back up. `warehouse` is rank 0, which
 *  is what makes it root-only. Controller maps it to `400 invalid_parent_type`. */
export class InvalidParentTypeError extends Error {
  constructor(
    public parentType: StorageNodeType,
    public childType: StorageNodeType,
  ) {
    super(`a ${childType} cannot be placed under a ${parentType}`);
    this.name = 'InvalidParentTypeError';
  }
}

/** A node id that is well-formed and live, but belongs to another warehouse —
 *  so it can't be this one's parent, and can't scope this one's stock read.
 *  Controller maps it to `400 node_warehouse_mismatch`. */
export class NodeWarehouseMismatchError extends Error {
  constructor(
    public nodeId: string,
    public warehouseId: string,
  ) {
    super(`storage node ${nodeId} does not belong to warehouse ${warehouseId}`);
    this.name = 'NodeWarehouseMismatchError';
  }
}

/** Node names are unique among live siblings (`storage_nodes_name_in_parent_uidx`,
 *  roots deduping per warehouse). Raised from the unique violation rather than a
 *  pre-check, so two concurrent creates can't both pass. Controller maps it to
 *  `409 duplicate_node_name`. */
export class DuplicateNodeNameError extends Error {
  constructor(public name: string) {
    super(`a sibling storage node is already named "${name}"`);
    this.name = 'DuplicateNodeNameError';
  }
}

/** Delete and re-parent are empty-only (01 §2): a warehouse holding stock or
 *  live sub-warehouses can't be removed or moved, because either would strand
 *  inventory whose movements point at this location forever. Controller maps it
 *  to `409 warehouse_not_empty`. */
export class WarehouseNotEmptyError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = 'WarehouseNotEmptyError';
  }
}

/** Same rule one level down: a node with live children or any stock at it stays.
 *  Controller maps it to `409 node_not_empty`. */
export class NodeNotEmptyError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = 'NodeNotEmptyError';
  }
}

/** The user being made responsible for a location doesn't exist or is
 *  soft-deleted. Checked up front so a dangling id is a 400 naming the field
 *  rather than an FK violation surfacing as a 500. Controller maps it to
 *  `400 assignee_not_found`. */
export class AssigneeNotFoundError extends Error {
  constructor(public userId: string) {
    super(`assignee not found: ${userId}`);
    this.name = 'AssigneeNotFoundError';
  }
}

/** `assignmentRole: technician` means "this is their van" (01 §2), so the user
 *  behind it must actually hold the technician role. Supervisor and leader
 *  assignments are open to any live user — an admin may well run a warehouse.
 *  Controller maps it to `400 not_a_technician`. */
export class NotATechnicianError extends Error {
  constructor(public userId: string) {
    super(`user ${userId} is not a technician`);
    this.name = 'NotATechnicianError';
  }
}

/** One active van per technician (01 §2). Deliberately a SERVICE rule, not a
 *  unique index: the same user may hold several warehouses as supervisor or
 *  leader, so only the technician-role assignment is exclusive. Controller maps
 *  it to `409 technician_already_assigned`. */
export class TechnicianAlreadyAssignedError extends Error {
  constructor(
    public userId: string,
    public warehouseId: string,
  ) {
    super(`technician ${userId} is already assigned to warehouse ${warehouseId}`);
    this.name = 'TechnicianAlreadyAssignedError';
  }
}

/** Only the top two structure levels carry someone in charge — a warehouse node
 *  or a storage unit, never a rack, section or box (`storage_nodes_assignee_level_check`,
 *  user 2026-08-21). The DB holds this one because `type` is immutable after
 *  create; the service answers it first so the caller gets a named code.
 *  Controller maps it to `400 invalid_assignment_level`. */
export class InvalidAssignmentLevelError extends Error {
  constructor(public type: StorageNodeType) {
    super(`a ${type} cannot carry an assignee`);
    this.name = 'InvalidAssignmentLevelError';
  }
}

/** An assignee and its role travel together — neither alone
 *  (`*_assignment_role_check` on both tables). Reachable on PATCH, where a
 *  partial body can clear one side and leave the other standing. Controller maps
 *  it to `400 incomplete_assignment`. */
export class IncompleteAssignmentError extends Error {
  constructor(public present: 'user' | 'role') {
    super(`assignment needs both a user and a role; only the ${present} was given`);
    this.name = 'IncompleteAssignmentError';
  }
}

/** A warehouse MUST stay findable (`warehouses_locatable_check`, client
 *  requirement 2026-08-08): a location reference and/or a full coordinate pair,
 *  never neither. Checked against the MERGED row on PATCH, so clearing the last
 *  one standing is refused rather than left to the DB. Controller maps it to
 *  `400 warehouse_not_locatable`. */
export class WarehouseNotLocatableError extends Error {
  constructor() {
    super('a warehouse needs a location reference or a latitude/longitude pair');
    this.name = 'WarehouseNotLocatableError';
  }
}

/** A technician reached a warehouse that is not their van. Staff
 *  (owner/admin/office) never hit this — they see the whole registry. Controller
 *  maps it to `403 not_own_van`. */
export class NotOwnWarehouseError extends Error {
  constructor(public warehouseId: string) {
    super(`warehouse ${warehouseId} is not assigned to this technician`);
    this.name = 'NotOwnWarehouseError';
  }
}

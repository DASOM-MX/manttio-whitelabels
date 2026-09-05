import type {
  LocationAssigneeDTO,
  StorageNodeDTO,
  StorageNodeRow,
} from '../types/warehouses.types';

// Row → DTO for storage nodes (10-wms/02 §2). Pure shaping: no queries, no
// rules, nothing that can fail — which is what keeps it out of the service and
// makes it readable on its own.

const opt = <T>(value: T | null): T | undefined => value ?? undefined;

/** The assignee is only ever half-present in theory — the DB check pairs the
 *  user and the role — so a missing name means the join found no live user,
 *  and the DTO drops the block rather than rendering a nameless badge. */
const assigneeOf = (
  row: StorageNodeRow,
  name: string | null,
): LocationAssigneeDTO | undefined =>
  row.assignedUserId && row.assignmentRole && name
    ? { id: row.assignedUserId, name, role: row.assignmentRole }
    : undefined;

/** `hasChildren` is passed in rather than derived: it comes from a correlated
 *  EXISTS in the list query (04 §2's lazy tree), and a create knows it is
 *  false without asking. */
export const toStorageNodeDTO = (
  row: StorageNodeRow,
  assigneeName: string | null,
  hasChildren: boolean,
): StorageNodeDTO => ({
  id: row.id,
  warehouseId: row.warehouseId,
  parentNodeId: opt(row.parentNodeId),
  type: row.type,
  name: row.name,
  description: opt(row.description),
  locationReference: opt(row.locationReference),
  assignedUser: assigneeOf(row, assigneeName),
  hasChildren,
  createdAt: row.createdAt.toISOString(),
});

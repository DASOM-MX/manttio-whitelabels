import { StorageNodeType } from '../enums/storage-nodes.enum';

/** The node levels that may carry someone in charge (user 2026-08-21).
 *
 *  The DB holds this rule too (`storage_nodes_assignee_level_check`), but the
 *  service checks first so the caller gets `400 invalid_assignment_level`
 *  instead of a constraint violation surfacing as a 500. A rack or a shelf has
 *  no owner — responsibility attaches to a building or a storage unit. */
export const ASSIGNABLE_NODE_TYPES: StorageNodeType[] = [
  StorageNodeType.Warehouse,
  StorageNodeType.StorageUnit,
];
